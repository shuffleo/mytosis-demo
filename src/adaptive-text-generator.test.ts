import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AdaptiveTextGenerationCoordinator,
  IndexedDbTextVariantCache,
  type AdaptiveTextRuntimeState,
  type TextVariantGenerationResult,
  type TextVariantGenerator,
} from './adaptive-text-generator'
import { canonicalTextHash, type AdaptiveTextVariantMetadata } from './adaptive-text'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

class FakeGenerator implements TextVariantGenerator {
  readonly id = 'fake-generator'
  calls: string[] = []
  responses: Array<ReturnType<typeof deferred<TextVariantGenerationResult>>> = []

  generate(
    request: { text: string },
    options: {
      signal: AbortSignal
      onStatus?: (status: {
        phase: 'loading' | 'generating'
        message: string
      }) => void
    },
  ) {
    this.calls.push(request.text)
    options.onStatus?.({ phase: 'loading', message: 'Loading fake model' })
    const response = deferred<TextVariantGenerationResult>()
    this.responses.push(response)
    return response.promise
  }

  dispose() {}
}

afterEach(() => {
  vi.useRealTimers()
})

describe('adaptive text generation coordinator', () => {
  it('debounces edits, cancels stale work, and applies only the latest source hash', async () => {
    vi.useFakeTimers()
    const generator = new FakeGenerator()
    const metadata: Array<{
      hash: string
      value: AdaptiveTextVariantMetadata | undefined
    }> = []
    const coordinator = new AdaptiveTextGenerationCoordinator({
      generator,
      onMetadata: (_cellId, hash, value) => metadata.push({ hash, value }),
      onRuntimeState: () => undefined,
      now: () => 42,
    })

    coordinator.schedule('cell-1', 'first draft text', {
      enabled: true,
      debounceMs: 300,
    })
    await vi.advanceTimersByTimeAsync(150)
    coordinator.schedule('cell-1', 'final canonical text', {
      enabled: true,
      debounceMs: 300,
    })
    await vi.advanceTimersByTimeAsync(300)

    expect(generator.calls).toEqual(['final canonical text'])
    generator.responses[0].resolve({
      values: {
        S: 'Final canonical.',
        XS: 'Final text.',
        XXS: 'Final.',
      },
      provider: 'fake',
      model: 'fake-model',
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(metadata.map(({ value }) => value?.status)).toEqual(
      expect.arrayContaining(['pending', 'loading', 'ready']),
    )
    expect(metadata.at(-1)).toMatchObject({
      hash: canonicalTextHash('final canonical text'),
      value: { status: 'ready', provenance: 'on-device-model' },
    })
    coordinator.dispose()
  })

  it('keeps deterministic variants and exposes fallback state when the model is offline', async () => {
    vi.useFakeTimers()
    const generator = new FakeGenerator()
    const metadata: AdaptiveTextVariantMetadata[] = []
    const runtime: AdaptiveTextRuntimeState[] = []
    const coordinator = new AdaptiveTextGenerationCoordinator({
      generator,
      onMetadata: (_cellId, _hash, value) => {
        if (value) metadata.push(value)
      },
      onRuntimeState: (state) => runtime.push(state),
    })
    coordinator.schedule(
      'cell-1',
      'The difficult conversation became easier after I named the concern.',
      { enabled: true, debounceMs: 0 },
    )
    await vi.advanceTimersByTimeAsync(0)
    generator.responses[0].reject(new Error('Network unavailable'))
    await Promise.resolve()
    await Promise.resolve()

    expect(metadata.at(-1)).toMatchObject({
      status: 'fallback',
      provenance: 'deterministic-fallback',
      error: 'Network unavailable',
    })
    expect(metadata.at(-1)?.values.XXS).toBeTruthy()
    expect(runtime.at(-1)?.phase).toBe('error')
    coordinator.dispose()
  })

  it('discards an in-flight result after a newer edit changes the source hash', async () => {
    vi.useFakeTimers()
    const generator = new FakeGenerator()
    const applied: Array<{ hash: string; status?: string }> = []
    const coordinator = new AdaptiveTextGenerationCoordinator({
      generator,
      onMetadata: (_cellId, hash, value) =>
        applied.push({ hash, status: value?.status }),
      onRuntimeState: () => undefined,
    })
    coordinator.schedule('cell-1', 'old canonical thought', {
      enabled: true,
      debounceMs: 0,
    })
    await vi.advanceTimersByTimeAsync(0)
    coordinator.schedule('cell-1', 'new canonical thought', {
      enabled: true,
      debounceMs: 0,
    })
    await vi.advanceTimersByTimeAsync(0)

    generator.responses[0].resolve({
      values: { S: 'Old thought.', XS: 'Old.', XXS: 'Old.' },
      provider: 'fake',
      model: 'fake-model',
    })
    generator.responses[1].resolve({
      values: { S: 'New thought.', XS: 'New.', XXS: 'New.' },
      provider: 'fake',
      model: 'fake-model',
    })
    await Promise.resolve()
    await Promise.resolve()

    const oldHash = canonicalTextHash('old canonical thought')
    const newHash = canonicalTextHash('new canonical thought')
    expect(applied.some(({ hash, status }) => hash === oldHash && status === 'ready')).toBe(
      false,
    )
    expect(applied.at(-1)).toEqual({ hash: newHash, status: 'ready' })
    coordinator.dispose()
  })

  it('uses the deterministic path without starting a model when local generation is disabled', () => {
    const generator = new FakeGenerator()
    const metadata: AdaptiveTextVariantMetadata[] = []
    const coordinator = new AdaptiveTextGenerationCoordinator({
      generator,
      onMetadata: (_cellId, _hash, value) => {
        if (value) metadata.push(value)
      },
      onRuntimeState: () => undefined,
    })
    coordinator.schedule('cell-1', 'A canonical journal thought.', {
      enabled: false,
      debounceMs: 0,
    })
    expect(generator.calls).toEqual([])
    expect(metadata[0]).toMatchObject({
      status: 'fallback',
      provider: 'local-deterministic',
    })
    coordinator.dispose()
  })

  it('caches generated results locally for repeat source hashes', async () => {
    const cache = new IndexedDbTextVariantCache()
    const result: TextVariantGenerationResult = {
      values: { S: 'Short.', XS: 'Tiny.', XXS: 'T.' },
      provider: 'test',
      model: 'test-model',
    }
    await cache.set('same-source', result)
    expect(await cache.get('same-source')).toEqual(result)
  })
})
