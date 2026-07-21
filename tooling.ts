import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, sep } from 'node:path'
import { promisify } from 'node:util'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import type { ToolStatus } from '../../shared/types'

const exec = promisify(execFile)

export function unpackedBinaryPath(value: string): string {
  if (!value.includes(`${sep}app.asar${sep}`)) return value
  const unpacked = value.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`)
  return existsSync(unpacked) ? unpacked : value
}

async function detect(name: string, command: string, args: string[], fallback?: string): Promise<ToolStatus> {
  for (const candidate of [command, fallback].filter(Boolean) as string[]) {
    try {
      const { stdout, stderr } = await exec(candidate, args, { windowsHide: true, timeout: 5000 })
      const version = `${stdout}${stderr}`.split(/\r?\n/).find(Boolean)?.trim()
      return { name, available: true, version, path: candidate }
    } catch { /* try packaged fallback */ }
  }
  return { name, available: false }
}

export async function inspectTools(): Promise<ToolStatus[]> {
  return Promise.all([
    detect('FFmpeg', 'ffmpeg', ['-version'], ffmpegStatic ? unpackedBinaryPath(ffmpegStatic) : undefined),
    detect('FFprobe', 'ffprobe', ['-version'], unpackedBinaryPath(ffprobeStatic.path)),
    detect('Python', process.platform === 'win32' ? 'python' : 'python3', ['--version']),
    detect('yt-dlp', 'yt-dlp', ['--version'], ytDlpPath())
  ])
}

export function ffmpegPath(): string { return ffmpegStatic ? unpackedBinaryPath(ffmpegStatic) : 'ffmpeg' }

export function ytDlpPath(): string {
  const require = createRequire(import.meta.url)
  const packagePath = require.resolve('youtube-dl-exec/package.json')
  return unpackedBinaryPath(join(dirname(packagePath), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'))
}
