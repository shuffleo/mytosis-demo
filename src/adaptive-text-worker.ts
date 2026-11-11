import {
  ADAPTIVE_TEXT_MODEL_ID,
  normalizeGeneratedVariants,
  type DerivedTextVariants,
} from './adaptive-text'

interface GenerateMessage {
  type: 'generate'
  requestId: number
  text: string
}

interface CancelMessage {
  type: 'cancel'
  requestId: number
}

type TextGenerator = (
  prompt: string,
  options: {
    max_new_tokens: number
    do_sample: boolean
    repetition_penalty: number
  },
) => Promise<unknown>

let generatorPromise: Promise<TextGenerator> | null = null
let generationQueue = Promise.resolve()
const cancelled = new Set<number>()
// Loading the pinned browser build here keeps inference lazy. Bundling ONNX
// Runtime emits a 25.6 MiB WASM asset, which exceeds Cloudflare's 25 MiB
// per-asset limit; jsDelivr serves the same runtime with immutable caching.
const TRANSFORMERS_RUNTIME_URL =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/+esm'

function postStatus(
  requestId: number,
  phase: 'loading' | 'generating',
  message: string,
  progress?: number,
) {
  self.postMessage({ type: 'status', requestId, phase, message, progress })
}

function progressValue(progress: unknown) {
  if (!progress || typeof progress !== 'object') return undefined
  const value = Reflect.get(progress, 'progress')
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value <= 1 ? value * 100 : value
}

async function loadGenerator(requestId: number) {
  if (generatorPromise) return generatorPromise
  generatorPromise = (async () => {
    postStatus(requestId, 'loading', 'Loading small on-device language model', 0)
    const runtime = (await import(
      /* @vite-ignore */ TRANSFORMERS_RUNTIME_URL
    )) as {
      pipeline: (
        task: string,
        model: string,
        options: Record<string, unknown>,
      ) => Promise<unknown>
    }
    const { pipeline } = runtime
    const progress = (event: unknown) => {
      const value = progressValue(event)
      postStatus(
        requestId,
        'loading',
        value === undefined
          ? 'Preparing on-device model'
          : `Loading on-device model ${Math.round(value)}%`,
        value,
      )
    }
    if ('gpu' in navigator) {
      try {
        return (await pipeline(
          'text-generation',
          ADAPTIVE_TEXT_MODEL_ID,
          {
            device: 'webgpu',
            dtype: 'q4f16',
            progress_callback: progress,
          },
        )) as unknown as TextGenerator
      } catch {
        postStatus(
          requestId,
          'loading',
          'WebGPU unavailable; loading CPU model',
        )
      }
    }
    return (await pipeline('text-generation', ADAPTIVE_TEXT_MODEL_ID, {
      device: 'wasm',
      dtype: 'uint8',
      progress_callback: progress,
    })) as unknown as TextGenerator
  })()
  try {
    return await generatorPromise
  } catch (error) {
    generatorPromise = null
    throw error
  }
}

function extractGeneratedText(output: unknown, prompt: string) {
  if (!Array.isArray(output) || output.length === 0) return ''
  const generated = Reflect.get(output[0] as object, 'generated_text')
  if (typeof generated === 'string') {
    return generated.startsWith(prompt)
      ? generated.slice(prompt.length).trim()
      : generated.trim()
  }
  if (Array.isArray(generated)) {
    const last = generated[generated.length - 1]
    if (last && typeof last === 'object') {
      const content = Reflect.get(last, 'content')
      return typeof content === 'string' ? content.trim() : ''
    }
  }
  return ''
}

async function generateLevel(
  generator: TextGenerator,
  canonical: string,
  label: keyof DerivedTextVariants,
  maximumWords: number,
) {
  const prompt = [
    'Rewrite the journal thought below as one shorter natural sentence.',
    'Preserve its meaning, subject, intent, and any negation.',
    'Remove filler and simplify wording. Do not explain your answer.',
    `Use at most ${maximumWords} words.`,
    `Journal thought: ${canonical}`,
    `${label}:`,
  ].join('\n')
  const output = await generator(prompt, {
    max_new_tokens: Math.max(8, maximumWords * 3),
    do_sample: false,
    repetition_penalty: 1.08,
  })
  return extractGeneratedText(output, prompt)
}

async function run(message: GenerateMessage) {
  try {
    if (cancelled.has(message.requestId)) return
    const generator = await loadGenerator(message.requestId)
    if (cancelled.has(message.requestId)) return
    postStatus(message.requestId, 'generating', 'Generating shorter variants')
    const words = message.text.trim().split(/\s+/u).filter(Boolean)
    const targets = {
      S: Math.max(1, Math.ceil(words.length * 0.72)),
      XS: Math.max(1, Math.ceil(words.length * 0.5)),
      XXS: Math.max(1, Math.ceil(words.length * 0.32)),
    }
    const S = await generateLevel(generator, message.text, 'S', targets.S)
    if (cancelled.has(message.requestId)) return
    const XS = await generateLevel(generator, message.text, 'XS', targets.XS)
    if (cancelled.has(message.requestId)) return
    const XXS = await generateLevel(generator, message.text, 'XXS', targets.XXS)
    if (cancelled.has(message.requestId)) return
    const values = normalizeGeneratedVariants(message.text, { S, XS, XXS })
    self.postMessage({
      type: 'result',
      requestId: message.requestId,
      values,
      provider: 'transformers-js-worker',
      model: ADAPTIVE_TEXT_MODEL_ID,
    })
  } catch (error) {
    if (cancelled.has(message.requestId)) return
    self.postMessage({
      type: 'error',
      requestId: message.requestId,
      error:
        error instanceof Error
          ? error.message
          : 'On-device text generation failed',
    })
  } finally {
    cancelled.delete(message.requestId)
  }
}

self.onmessage = (event: MessageEvent<GenerateMessage | CancelMessage>) => {
  const message = event.data
  if (message.type === 'cancel') {
    cancelled.add(message.requestId)
    return
  }
  generationQueue = generationQueue.then(() => run(message))
}
