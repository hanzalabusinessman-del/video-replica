import { contextBridge, ipcRenderer } from 'electron'
import type { CreateProjectInput, JobUpdate, VideoReplicaApi } from '../shared/types'

const api: VideoReplicaApi = {
  system: {
    snapshot: () => ipcRenderer.invoke('system:snapshot'),
    openFolder: (kind) => ipcRenderer.invoke('system:open-folder', kind),
    showItem: (path) => ipcRenderer.invoke('system:show-item', path),
    pickMedia: () => ipcRenderer.invoke('system:pick-media')
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    get: (id) => ipcRenderer.invoke('projects:get', id),
    create: (input: CreateProjectInput) => ipcRenderer.invoke('projects:create', input),
    update: (id, patch) => ipcRenderer.invoke('projects:update', id, patch),
    saveTimeline: (id, tracks) => ipcRenderer.invoke('projects:save-timeline', id, tracks),
    remove: (id) => ipcRenderer.invoke('projects:remove', id)
  },
  jobs: {
    start: (projectId) => ipcRenderer.invoke('jobs:start', projectId),
    cancel: (jobId) => ipcRenderer.invoke('jobs:cancel', jobId),
    list: () => ipcRenderer.invoke('jobs:list')
  },
  renders: { export: (projectId) => ipcRenderer.invoke('renders:export', projectId) },
  settings: {
    providerStatus: () => ipcRenderer.invoke('settings:provider-status'),
    saveApiKey: (provider, value) => ipcRenderer.invoke('settings:save-api-key', provider, value)
  },
  onJobUpdate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, update: JobUpdate): void => callback(update)
    ipcRenderer.on('jobs:update', listener)
    return () => ipcRenderer.removeListener('jobs:update', listener)
  }
}

contextBridge.exposeInMainWorld('videoReplica', api)
