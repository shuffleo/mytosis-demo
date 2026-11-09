/// <reference lib="webworker" />

import {
  clusterTexts,
  LocalTfidfEmbeddingProvider,
  type ClusteringOptions,
  type ClusteringProgress,
} from './clustering'

interface StartMessage {
  kind: 'start'
  jobId: string
  texts: string[]
  options: ClusteringOptions
}

interface CancelMessage {
  kind: 'cancel'
  jobId: string
}

const jobs = new Map<string, AbortController>()

self.addEventListener('message', async (event: MessageEvent<StartMessage | CancelMessage>) => {
  const message = event.data
  if (message.kind === 'cancel') {
    jobs.get(message.jobId)?.abort()
    jobs.delete(message.jobId)
    return
  }

  const controller = new AbortController()
  jobs.set(message.jobId, controller)
  const progress = (value: ClusteringProgress) =>
    self.postMessage({ kind: 'progress', jobId: message.jobId, value })
  try {
    const result = await clusterTexts(
      message.texts,
      new LocalTfidfEmbeddingProvider(),
      message.options,
      controller.signal,
      progress,
    )
    if (!controller.signal.aborted) {
      self.postMessage({ kind: 'result', jobId: message.jobId, result })
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      self.postMessage({
        kind: 'error',
        jobId: message.jobId,
        message: error instanceof Error ? error.message : 'Clustering failed',
      })
    }
  } finally {
    jobs.delete(message.jobId)
  }
})
