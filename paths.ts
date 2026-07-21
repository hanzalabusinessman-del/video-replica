import { app } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const folderNames = ['Projects', 'Cache', 'Assets', 'Images', 'Videos', 'Music', 'Voice', 'Transcript', 'Exports', 'Renders', 'Logs', 'Settings', 'Temp', 'Database'] as const
export type RuntimeFolder = typeof folderNames[number]

export class RuntimePaths {
  readonly root = join(app.getPath('userData'), 'workspace')
  async initialize(): Promise<void> {
    await Promise.all(folderNames.map((name) => mkdir(join(this.root, name), { recursive: true })))
  }
  get(name: RuntimeFolder): string { return join(this.root, name) }
  project(projectId: string): string { return join(this.get('Projects'), projectId) }
  async ensureProject(projectId: string): Promise<string> {
    const path = this.project(projectId)
    await Promise.all(['source', 'transcript', 'assets', 'voice', 'preview', 'renders'].map((part) => mkdir(join(path, part), { recursive: true })))
    return path
  }
}
