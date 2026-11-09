import type {
  ClusteringOptions,
  ClusteringProgress,
  ClusteringResult,
} from './clustering'

export function runLocalClustering(
  texts: readonly string[],
  options: ClusteringOptions,
  signal: AbortSignal,
  onProgress?: (progress: ClusteringProgress) => void,
) {
  return new Promise<ClusteringResult>((resolve, reject) => {
    const worker = new Worker(new URL('./clustering-worker.ts', import.meta.url), {
      type: 'module',
      name: 'journal-autogroup',
    })
    const jobId = `cluster-${Date.now()}-${options.seed}`
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      worker.terminate()
      signal.removeEventListener('abort', cancel)
    }
    const cancel = () => {
      worker.postMessage({ kind: 'cancel', jobId })
      finish()
      const error = new Error('Clustering cancelled')
      error.name = 'AbortError'
      reject(error)
    }
    signal.addEventListener('abort', cancel, { once: true })
    worker.addEventListener('message', (event) => {
      const message = event.data as {
        kind: 'progress' | 'result' | 'error'
        jobId: string
        value?: ClusteringProgress
        result?: ClusteringResult
        message?: string
      }
      if (message.jobId !== jobId || settled) return
      if (message.kind === 'progress' && message.value) onProgress?.(message.value)
      if (message.kind === 'result' && message.result) {
        finish()
        resolve(message.result)
      }
      if (message.kind === 'error') {
        finish()
        reject(new Error(message.message ?? 'Clustering failed'))
      }
    })
    worker.addEventListener('error', (event) => {
      if (settled) return
      finish()
      reject(new Error(event.message || 'Clustering worker failed'))
    })
    if (signal.aborted) {
      cancel()
      return
    }
    worker.postMessage({ kind: 'start', jobId, texts: [...texts], options })
  })
}
