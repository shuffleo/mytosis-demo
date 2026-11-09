import { describe, expect, it, vi } from 'vitest'
import {
  clusterTexts,
  cosineDistance,
  deterministicKMeans,
  LocalTfidfEmbeddingProvider,
  silhouetteScore,
  tokenizeReflectiveText,
  type EmbeddingProvider,
} from './clustering'

const options = { autoK: true, minK: 2, maxK: 3, seed: 42 }

describe('browser-local clustering', () => {
  it('normalizes text transparently and adds useful bigrams', () => {
    expect(tokenizeReflectiveText('I protected the quiet hour, QUIET hour.')).toEqual([
      'protected',
      'quiet',
      'hour',
      'quiet',
      'hour',
      'bi:protected_quiet',
      'bi:quiet_hour',
      'bi:hour_quiet',
      'bi:quiet_hour',
    ])
  })

  it('produces normalized TF-IDF vectors and cosine distances', async () => {
    const provider = new LocalTfidfEmbeddingProvider()
    const vectors = await provider.embed(
      ['quiet focus protected', 'quiet focus returned', 'team conversation clarified'],
      new AbortController().signal,
    )
    expect(vectors).toHaveLength(3)
    expect(Math.hypot(...vectors[0])).toBeCloseTo(1, 5)
    expect(cosineDistance(vectors[0], vectors[1])).toBeLessThan(
      cosineDistance(vectors[0], vectors[2]),
    )
  })

  it('runs seeded k-means and automatic k selection deterministically', async () => {
    const texts = [
      'quiet focus protected my afternoon',
      'quiet focus helped me finish',
      'team feedback clarified the decision',
      'team conversation made uncertainty specific',
      'rest made tomorrow easier to plan',
      'rest protected my energy for tomorrow',
    ]
    const provider = new LocalTfidfEmbeddingProvider()
    const first = await clusterTexts(
      texts,
      provider,
      options,
      new AbortController().signal,
    )
    const second = await clusterTexts(
      texts,
      provider,
      options,
      new AbortController().signal,
    )
    expect(first).toEqual(second)
    expect(first.k).toBeGreaterThanOrEqual(2)
    expect(first.k).toBeLessThanOrEqual(3)
    expect(first.assignments).toHaveLength(texts.length)

    const vectors = await provider.embed(texts, new AbortController().signal)
    const direct = deterministicKMeans(vectors, first.k, options.seed)
    expect(direct.assignments).toEqual(first.assignments)
    expect(silhouetteScore(vectors, direct.assignments)).toBeCloseTo(first.score)
  })

  it('honors cancellation and accepts a provider-neutral implementation', async () => {
    const embed = vi.fn(async (texts: readonly string[], signal: AbortSignal) => {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      return texts.map((_, index) => new Float32Array([index % 2, (index + 1) % 2]))
    })
    const provider: EmbeddingProvider = { id: 'test-provider', version: '9', embed }
    const result = await clusterTexts(
      ['first thought', 'second thought', 'third thought', 'fourth thought'],
      provider,
      { ...options, autoK: false },
      new AbortController().signal,
    )
    expect(embed).toHaveBeenCalledOnce()
    expect(result.provider).toEqual({ id: 'test-provider', version: '9' })

    const controller = new AbortController()
    controller.abort()
    await expect(
      clusterTexts(['one', 'two'], provider, options, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('keeps two-item automatic clustering useful as one small group', async () => {
    const result = await clusterTexts(
      ['one concrete reflection', 'another concrete reflection'],
      new LocalTfidfEmbeddingProvider(),
      options,
      new AbortController().signal,
    )
    expect(result.k).toBe(1)
    expect(result.assignments).toEqual([0, 0])
  })
})
