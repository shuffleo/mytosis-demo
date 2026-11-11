import {
  ADAPTIVE_TEXT_MODEL_ID,
  ADAPTIVE_TEXT_PROMPT_VERSION,
  canonicalTextHash,
  createDeterministicVariants,
  normalizeGeneratedVariants,
  type AdaptiveTextGenerationStatus,
  type AdaptiveTextVariantMetadata,
  type DerivedTextVariants,
} from './adaptive-text'

export interface TextVariantGenerationRequest {
  text: string
  sourceHash: string
}

export interface TextVariantGenerationResult {
  values: DerivedTextVariants
  provider: string
  model: string
  cacheHit?: boolean
}

export interface TextVariantGeneratorStatus {
  phase: 'loading' | 'generating'
  progress?: number
  message: string
}

export interface TextVariantGenerator {
  readonly id: string
  generate(
    request: TextVariantGenerationRequest,
    options: {
      signal: AbortSignal
      onStatus?: (status: TextVariantGeneratorStatus) => void
    },
  ): Promise<TextVariantGenerationResult>
  dispose(): void
}

export interface AdaptiveTextRuntimeState {
  phase: 'idle' | AdaptiveTextGenerationStatus
  message: string
  progress?: number
}

interface WorkerStatusMessage {
  type: 'status'
  requestId: number
  phase: 'loading' | 'generating'
  progress?: number
  message: string
}

interface WorkerResultMessage {
  type: 'result'
  requestId: number
  values: DerivedTextVariants
  provider: string
  model: string
}

interface WorkerErrorMessage {
  type: 'error'
  requestId: number
  error: string
}

type WorkerResponse = WorkerStatusMessage | WorkerResultMessage | WorkerErrorMessage

interface PendingWorkerRequest {
  resolve: (result: TextVariantGenerationResult) => void
  reject: (error: Error) => void
  onStatus?: (status: TextVariantGeneratorStatus) => void
}

export interface TextVariantCache {
  get(key: string): Promise<TextVariantGenerationResult | null>
  set(key: string, value: TextVariantGenerationResult): Promise<void>
}

export class IndexedDbTextVariantCache implements TextVariantCache {
  private memory = new Map<string, TextVariantGenerationResult>()
  private databasePromise: Promise<IDBDatabase | null> | null = null

  private database() {
    if (this.databasePromise) return this.databasePromise
    this.databasePromise = new Promise((resolve) => {
      if (!globalThis.indexedDB) {
        resolve(null)
        return
      }
      const request = globalThis.indexedDB.open('mytosis-adaptive-text', 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('variants')) {
          request.result.createObjectStore('variants')
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    })
    return this.databasePromise
  }

  async get(key: string) {
    const memoryValue = this.memory.get(key)
    if (memoryValue) return structuredClone(memoryValue)
    const database = await this.database()
    if (!database) return null
    return new Promise<TextVariantGenerationResult | null>((resolve) => {
      const request = database
        .transaction('variants', 'readonly')
        .objectStore('variants')
        .get(key)
      request.onsuccess = () => {
        const value = request.result as TextVariantGenerationResult | undefined
        if (value) this.memory.set(key, value)
        resolve(value ? structuredClone(value) : null)
      }
      request.onerror = () => resolve(null)
    })
  }

  async set(key: string, value: TextVariantGenerationResult) {
    this.memory.set(key, structuredClone(value))
    const database = await this.database()
    if (!database) return
    await new Promise<void>((resolve) => {
      const request = database
        .transaction('variants', 'readwrite')
        .objectStore('variants')
        .put(structuredClone(value), key)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
    })
  }
}

export class BrowserWorkerTextVariantGenerator implements TextVariantGenerator {
  readonly id = 'browser-worker-transformers'
  private worker: Worker | null = null
  private nextRequestId = 1
  private pending = new Map<number, PendingWorkerRequest>()
  private readonly cache: TextVariantCache

  constructor(cache: TextVariantCache = new IndexedDbTextVariantCache()) {
    this.cache = cache
  }

  private ensureWorker() {
    if (this.worker) return this.worker
    const worker = new Worker(
      new URL('./adaptive-text-worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      const pending = this.pending.get(message.requestId)
      if (!pending) return
      if (message.type === 'status') {
        pending.onStatus?.({
          phase: message.phase,
          progress: message.progress,
          message: message.message,
        })
        return
      }
      this.pending.delete(message.requestId)
      if (message.type === 'error') {
        pending.reject(new Error(message.error))
        return
      }
      pending.resolve({
        values: message.values,
        provider: message.provider,
        model: message.model,
      })
    }
    worker.onerror = (event) => {
      this.rejectAll(new Error(event.message || 'On-device model worker failed'))
    }
    this.worker = worker
    return worker
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
    this.worker?.terminate()
    this.worker = null
  }

  private cacheKey(request: TextVariantGenerationRequest) {
    return [
      ADAPTIVE_TEXT_MODEL_ID,
      ADAPTIVE_TEXT_PROMPT_VERSION,
      request.sourceHash,
    ].join(':')
  }

  async generate(
    request: TextVariantGenerationRequest,
    options: {
      signal: AbortSignal
      onStatus?: (status: TextVariantGeneratorStatus) => void
    },
  ) {
    if (options.signal.aborted) throw new DOMException('Generation cancelled', 'AbortError')
    if (
      import.meta.env.DEV &&
      typeof navigator !== 'undefined' &&
      navigator.webdriver &&
      globalThis.localStorage?.getItem('mytosis.force-adaptive-worker') !== 'true'
    ) {
      throw new Error('On-device model loading is disabled under automated development tests')
    }
    const cacheKey = this.cacheKey(request)
    const cached = await this.cache.get(cacheKey)
    if (options.signal.aborted) throw new DOMException('Generation cancelled', 'AbortError')
    if (cached) return { ...cached, cacheHit: true }
    const requestId = this.nextRequestId
    this.nextRequestId += 1
    const worker = this.ensureWorker()
    const result = await new Promise<TextVariantGenerationResult>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve,
        reject,
        onStatus: options.onStatus,
      })
      const cancel = () => {
        const pending = this.pending.get(requestId)
        if (!pending) return
        this.pending.delete(requestId)
        worker.postMessage({ type: 'cancel', requestId })
        pending.reject(new DOMException('Generation cancelled', 'AbortError'))
      }
      options.signal.addEventListener('abort', cancel, { once: true })
      worker.postMessage({
        type: 'generate',
        requestId,
        text: request.text,
      })
    })
    const normalized = {
      ...result,
      values: normalizeGeneratedVariants(request.text, result.values),
    }
    await this.cache.set(cacheKey, normalized)
    return normalized
  }

  dispose() {
    this.rejectAll(new DOMException('Generation worker disposed', 'AbortError'))
  }
}

interface ScheduledGeneration {
  sequence: number
  timeout: ReturnType<typeof globalThis.setTimeout> | null
  controller: AbortController
  sourceHash: string
  fallback: DerivedTextVariants
}

export interface AdaptiveTextCoordinatorOptions {
  generator: TextVariantGenerator
  onMetadata: (
    cellId: string,
    sourceHash: string,
    metadata: AdaptiveTextVariantMetadata | undefined,
  ) => void
  onRuntimeState: (state: AdaptiveTextRuntimeState) => void
  now?: () => number
}

export class AdaptiveTextGenerationCoordinator {
  private scheduled = new Map<string, ScheduledGeneration>()
  private sequence = 0
  private readonly now: () => number
  private readonly options: AdaptiveTextCoordinatorOptions

  constructor(options: AdaptiveTextCoordinatorOptions) {
    this.options = options
    this.now = options.now ?? (() => Date.now())
  }

  schedule(
    cellId: string,
    canonical: string,
    configuration: { enabled: boolean; debounceMs: number },
  ) {
    this.cancel(cellId)
    const text = canonical.trim()
    if (!text) {
      this.options.onMetadata(cellId, canonicalTextHash(''), undefined)
      return
    }
    const sourceHash = canonicalTextHash(text)
    const fallback = createDeterministicVariants(text)
    if (!configuration.enabled) {
      this.options.onMetadata(cellId, sourceHash, {
        sourceHash,
        status: 'fallback',
        values: fallback,
        provenance: 'deterministic-fallback',
        provider: 'local-deterministic',
        promptVersion: ADAPTIVE_TEXT_PROMPT_VERSION,
        generatedAtMs: this.now(),
      })
      this.options.onRuntimeState({
        phase: 'fallback',
        message: 'Local model disabled; deterministic variants active',
      })
      return
    }

    this.sequence += 1
    const sequence = this.sequence
    const controller = new AbortController()
    this.options.onMetadata(cellId, sourceHash, {
      sourceHash,
      status: 'pending',
      values: fallback,
      provenance: 'deterministic-fallback',
      provider: this.options.generator.id,
      model: ADAPTIVE_TEXT_MODEL_ID,
      promptVersion: ADAPTIVE_TEXT_PROMPT_VERSION,
      generatedAtMs: this.now(),
    })
    this.options.onRuntimeState({
      phase: 'pending',
      message: 'Waiting for edits to settle',
    })
    const timeout = globalThis.setTimeout(() => {
      void this.run(cellId, text, sourceHash, sequence, controller, fallback)
    }, Math.max(0, configuration.debounceMs))
    this.scheduled.set(cellId, {
      sequence,
      timeout,
      controller,
      sourceHash,
      fallback,
    })
  }

  private async run(
    cellId: string,
    text: string,
    sourceHash: string,
    sequence: number,
    controller: AbortController,
    fallback: DerivedTextVariants,
  ) {
    const current = this.scheduled.get(cellId)
    if (!current || current.sequence !== sequence) return
    current.timeout = null
    try {
      const result = await this.options.generator.generate(
        { text, sourceHash },
        {
          signal: controller.signal,
          onStatus: (status) => {
            if (this.scheduled.get(cellId)?.sequence !== sequence) return
            this.options.onMetadata(cellId, sourceHash, {
              sourceHash,
              status: status.phase,
              values: fallback,
              provenance: 'deterministic-fallback',
              provider: this.options.generator.id,
              model: ADAPTIVE_TEXT_MODEL_ID,
              promptVersion: ADAPTIVE_TEXT_PROMPT_VERSION,
              generatedAtMs: this.now(),
            })
            this.options.onRuntimeState(status)
          },
        },
      )
      if (
        controller.signal.aborted ||
        this.scheduled.get(cellId)?.sequence !== sequence
      ) {
        return
      }
      this.options.onMetadata(cellId, sourceHash, {
        sourceHash,
        status: 'ready',
        values: result.values,
        provenance: 'on-device-model',
        provider: result.provider,
        model: result.model,
        promptVersion: ADAPTIVE_TEXT_PROMPT_VERSION,
        generatedAtMs: this.now(),
        cacheHit: result.cacheHit,
      })
      this.options.onRuntimeState({
        phase: 'ready',
        message: result.cacheHit
          ? 'Adaptive variants restored from local cache'
          : 'Adaptive variants generated on device',
      })
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        return
      }
      const message =
        error instanceof Error ? error.message : 'On-device generation failed'
      this.options.onMetadata(cellId, sourceHash, {
        sourceHash,
        status: 'fallback',
        values: fallback,
        provenance: 'deterministic-fallback',
        provider: this.options.generator.id,
        model: ADAPTIVE_TEXT_MODEL_ID,
        promptVersion: ADAPTIVE_TEXT_PROMPT_VERSION,
        generatedAtMs: this.now(),
        error: message,
      })
      this.options.onRuntimeState({
        phase: 'error',
        message: `Model error; deterministic fallback active: ${message}`,
      })
    } finally {
      if (this.scheduled.get(cellId)?.sequence === sequence) {
        this.scheduled.delete(cellId)
      }
    }
  }

  cancel(cellId: string) {
    const current = this.scheduled.get(cellId)
    if (!current) return
    if (current.timeout !== null) globalThis.clearTimeout(current.timeout)
    current.controller.abort()
    this.scheduled.delete(cellId)
  }

  cancelAll() {
    for (const [cellId, scheduled] of this.scheduled) {
      this.options.onMetadata(cellId, scheduled.sourceHash, {
        sourceHash: scheduled.sourceHash,
        status: 'fallback',
        values: scheduled.fallback,
        provenance: 'deterministic-fallback',
        provider: this.options.generator.id,
        model: ADAPTIVE_TEXT_MODEL_ID,
        promptVersion: ADAPTIVE_TEXT_PROMPT_VERSION,
        generatedAtMs: this.now(),
        error: 'Generation cancelled',
      })
      this.cancel(cellId)
    }
    this.options.onRuntimeState({ phase: 'idle', message: 'Adaptive text idle' })
  }

  dispose() {
    for (const cellId of [...this.scheduled.keys()]) this.cancel(cellId)
    this.options.generator.dispose()
  }
}
