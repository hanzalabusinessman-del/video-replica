/// <reference types="vite/client" />
import type { VideoReplicaApi } from '../../shared/types'

declare global {
  interface Window { videoReplica: VideoReplicaApi }
}
export {}
