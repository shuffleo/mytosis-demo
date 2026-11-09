export interface EmbeddingProvider {
  readonly id: string
  readonly version: string
  embed(texts: readonly string[], signal: AbortSignal): Promise<Float32Array[]>
}

export interface ClusteringOptions {
  autoK: boolean
  minK: number
  maxK: number
  seed: number
}

export interface ClusteringProgress {
  phase: 'embedding' | 'selecting-k' | 'clustering'
  progress: number
  message: string
}

export interface ClusteringResult {
  assignments: number[]
  k: number
  score: number
  provider: { id: string; version: string }
  algorithm: 'cosine-kmeans'
  algorithmVersion: '1.0.0'
  settings: ClusteringOptions
  seed: number
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'but',
  'by',
  'for',
  'from',
  'had',
  'has',
  'have',
  'i',
  'in',
  'is',
  'it',
  'my',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'were',
  'with',
])

function abortError() {
  const error = new Error('Clustering cancelled')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError()
}

export function tokenizeReflectiveText(text: string) {
  const unigrams = text
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu)
    ?.map((token) => token.replace(/^['-]+|['-]+$/gu, ''))
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token)) ?? []
  const bigrams = unigrams
    .slice(0, -1)
    .map((token, index) => `bi:${token}_${unigrams[index + 1]}`)
  return [...unigrams, ...bigrams]
}

export class LocalTfidfEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'local-tfidf'
  readonly version = '1.0.0'

  async embed(texts: readonly string[], signal: AbortSignal) {
    throwIfAborted(signal)
    await Promise.resolve()
    const documents = texts.map(tokenizeReflectiveText)
    const vocabulary = [...new Set(documents.flat())].sort()
    if (vocabulary.length === 0) return texts.map(() => new Float32Array([0]))
    const indexByTerm = new Map(vocabulary.map((term, index) => [term, index]))
    const documentFrequency = new Float32Array(vocabulary.length)
    for (const document of documents) {
      for (const term of new Set(document)) {
        documentFrequency[indexByTerm.get(term) ?? 0] += 1
      }
    }
    const vectors = documents.map((document) => {
      const vector = new Float32Array(vocabulary.length)
      const counts = new Map<string, number>()
      for (const term of document) counts.set(term, (counts.get(term) ?? 0) + 1)
      for (const [term, count] of counts) {
        const index = indexByTerm.get(term)
        if (index === undefined) continue
        const tf = 1 + Math.log(count)
        const idf = Math.log((1 + documents.length) / (1 + documentFrequency[index])) + 1
        vector[index] = tf * idf
      }
      const norm = Math.hypot(...vector)
      if (norm > 0) {
        for (let index = 0; index < vector.length; index += 1) vector[index] /= norm
      }
      return vector
    })
    throwIfAborted(signal)
    return vectors
  }
}

export function cosineDistance(first: Float32Array, second: Float32Array) {
  let dot = 0
  let firstLength = 0
  let secondLength = 0
  const length = Math.max(first.length, second.length)
  for (let index = 0; index < length; index += 1) {
    const left = first[index] ?? 0
    const right = second[index] ?? 0
    dot += left * right
    firstLength += left * left
    secondLength += right * right
  }
  if (firstLength === 0 && secondLength === 0) return 0
  if (firstLength === 0 || secondLength === 0) return 1
  return 1 - dot / Math.sqrt(firstLength * secondLength)
}

function meanVector(vectors: readonly Float32Array[], indices: readonly number[]) {
  const centroid = new Float32Array(vectors[0]?.length ?? 1)
  if (indices.length === 0) return centroid
  for (const index of indices) {
    const vector = vectors[index]
    for (let dimension = 0; dimension < centroid.length; dimension += 1) {
      centroid[dimension] += vector[dimension] ?? 0
    }
  }
  for (let dimension = 0; dimension < centroid.length; dimension += 1) {
    centroid[dimension] /= indices.length
  }
  const norm = Math.hypot(...centroid)
  if (norm > 0) {
    for (let dimension = 0; dimension < centroid.length; dimension += 1) {
      centroid[dimension] /= norm
    }
  }
  return centroid
}

function seededUnit(seed: number, index: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  return (value >>> 0) / 0x1_0000_0000
}

export function deterministicKMeans(
  vectors: readonly Float32Array[],
  requestedK: number,
  seed: number,
  signal?: AbortSignal,
) {
  if (vectors.length === 0) return { assignments: [], centroids: [] }
  const k = Math.max(1, Math.min(requestedK, vectors.length))
  const selected = [Math.floor(seededUnit(seed, 0) * vectors.length) % vectors.length]
  while (selected.length < k) {
    let bestIndex = 0
    let bestDistance = Number.NEGATIVE_INFINITY
    for (let index = 0; index < vectors.length; index += 1) {
      if (selected.includes(index)) continue
      const nearest = Math.min(
        ...selected.map((selectedIndex) => cosineDistance(vectors[index], vectors[selectedIndex])),
      )
      const score = nearest + seededUnit(seed, index + selected.length * 31) * 1e-7
      if (score > bestDistance) {
        bestDistance = score
        bestIndex = index
      }
    }
    selected.push(bestIndex)
  }
  let centroids = selected.map((index) => new Float32Array(vectors[index]))
  let assignments = new Array(vectors.length).fill(0)
  for (let iteration = 0; iteration < 40; iteration += 1) {
    throwIfAborted(signal)
    const next = vectors.map((vector) => {
      let cluster = 0
      let nearest = Number.POSITIVE_INFINITY
      for (let index = 0; index < centroids.length; index += 1) {
        const candidate = cosineDistance(vector, centroids[index])
        if (candidate < nearest - 1e-9) {
          nearest = candidate
          cluster = index
        }
      }
      return cluster
    })
    const unchanged = next.every((cluster, index) => cluster === assignments[index])
    assignments = next
    centroids = Array.from({ length: k }, (_, cluster) => {
      const members = assignments
        .map((assignment, index) => (assignment === cluster ? index : -1))
        .filter((index) => index >= 0)
      if (members.length > 0) return meanVector(vectors, members)
      const farthest = vectors
        .map((vector, index) => ({
          index,
          distance: Math.min(...centroids.map((centroid) => cosineDistance(vector, centroid))),
        }))
        .sort((left, right) => right.distance - left.distance || left.index - right.index)[0]
      return new Float32Array(vectors[farthest.index])
    })
    if (unchanged && iteration > 0) break
  }
  return { assignments, centroids }
}

export function silhouetteScore(vectors: readonly Float32Array[], assignments: readonly number[]) {
  if (vectors.length < 3 || new Set(assignments).size < 2) return 0
  let total = 0
  for (let index = 0; index < vectors.length; index += 1) {
    const own = assignments[index]
    const same = vectors
      .map((_, candidate) => candidate)
      .filter((candidate) => candidate !== index && assignments[candidate] === own)
    const a =
      same.length === 0
        ? 0
        : same.reduce(
            (sum, candidate) => sum + cosineDistance(vectors[index], vectors[candidate]),
            0,
          ) / same.length
    const otherClusters = [...new Set(assignments)].filter((cluster) => cluster !== own)
    const b = Math.min(
      ...otherClusters.map((cluster) => {
        const members = vectors
          .map((_, candidate) => candidate)
          .filter((candidate) => assignments[candidate] === cluster)
        return (
          members.reduce(
            (sum, candidate) => sum + cosineDistance(vectors[index], vectors[candidate]),
            0,
          ) / Math.max(1, members.length)
        )
      }),
    )
    total += Math.max(a, b) === 0 ? 0 : (b - a) / Math.max(a, b)
  }
  return total / vectors.length
}

export async function clusterTexts(
  texts: readonly string[],
  provider: EmbeddingProvider,
  options: ClusteringOptions,
  signal: AbortSignal,
  onProgress?: (progress: ClusteringProgress) => void,
): Promise<ClusteringResult> {
  throwIfAborted(signal)
  onProgress?.({ phase: 'embedding', progress: 0.08, message: 'Reading reflections' })
  const vectors = await provider.embed(texts, signal)
  throwIfAborted(signal)
  if (texts.length < 2) {
    return {
      assignments: texts.map(() => 0),
      k: 1,
      score: 0,
      provider: { id: provider.id, version: provider.version },
      algorithm: 'cosine-kmeans',
      algorithmVersion: '1.0.0',
      settings: { ...options },
      seed: options.seed,
    }
  }
  if (texts.length === 2 && options.autoK) {
    onProgress?.({ phase: 'clustering', progress: 1, message: 'One small group ready' })
    return {
      assignments: [0, 0],
      k: 1,
      score: 0,
      provider: { id: provider.id, version: provider.version },
      algorithm: 'cosine-kmeans',
      algorithmVersion: '1.0.0',
      settings: { ...options },
      seed: options.seed,
    }
  }
  const minimum = Math.max(2, Math.min(options.minK, texts.length))
  const maximum = Math.max(minimum, Math.min(options.maxK, Math.max(2, texts.length - 1)))
  const candidates = options.autoK
    ? Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index)
    : [Math.max(minimum, Math.min(maximum, options.minK))]
  let best:
    | { assignments: number[]; k: number; score: number }
    | undefined
  for (let index = 0; index < candidates.length; index += 1) {
    throwIfAborted(signal)
    onProgress?.({
      phase: options.autoK ? 'selecting-k' : 'clustering',
      progress: 0.2 + (index / Math.max(1, candidates.length)) * 0.65,
      message: options.autoK ? `Testing ${candidates[index]} groups` : 'Forming groups',
    })
    const result = deterministicKMeans(vectors, candidates[index], options.seed, signal)
    const score = silhouetteScore(vectors, result.assignments)
    if (!best || score > best.score + 1e-8 || (Math.abs(score - best.score) < 1e-8 && candidates[index] < best.k)) {
      best = { assignments: result.assignments, k: candidates[index], score }
    }
    await Promise.resolve()
  }
  throwIfAborted(signal)
  onProgress?.({ phase: 'clustering', progress: 1, message: 'Groups ready' })
  return {
    assignments: best?.assignments ?? texts.map(() => 0),
    k: best?.k ?? 1,
    score: best?.score ?? 0,
    provider: { id: provider.id, version: provider.version },
    algorithm: 'cosine-kmeans',
    algorithmVersion: '1.0.0',
    settings: { ...options },
    seed: options.seed,
  }
}
