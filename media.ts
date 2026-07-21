import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { promisify } from 'node:util'
import type { Logger } from 'winston'
import { ffmpegPath, ytDlpPath } from './tooling'

const exec = promisify(execFile)

export class MediaService {
  private ytDlpPath: string
  constructor(private logger: Logger) {
    this.ytDlpPath = ytDlpPath()
  }

  async extractAudio(url: string, outputPath: string): Promise<string> {
    this.logger.info('Extracting source audio', { url: new URL(url).hostname })
    const outputDir = dirname(outputPath); const outputStem = basename(outputPath, extname(outputPath))
    await mkdir(outputDir, { recursive: true })
    for (const file of await readdir(outputDir)) if (file.startsWith(`${outputStem}.`)) await rm(join(outputDir, file), { force: true })
    await exec(this.ytDlpPath, [
      '--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0',
      '--ffmpeg-location', ffmpegPath(), '--no-playlist', '--no-warnings',
      '--retries', '3', '--fragment-retries', '3', '--output', outputPath, url
    ], { windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 })
    return outputPath
  }

  async downloadReferenceVideo(url: string, outputPath: string): Promise<string> {
    this.logger.info('Downloading reference video for style analysis', { url: new URL(url).hostname })
    const outputDir = dirname(outputPath); const outputStem = basename(outputPath, extname(outputPath))
    await mkdir(outputDir, { recursive: true })
    for (const file of await readdir(outputDir)) if (file.startsWith(`${outputStem}.`)) await rm(join(outputDir, file), { force: true })
    await exec(this.ytDlpPath, [
      '--format', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]', '--merge-output-format', 'mp4',
      '--ffmpeg-location', ffmpegPath(), '--no-playlist', '--no-warnings', '--retries', '3', '--fragment-retries', '3',
      '--output', outputPath, url
    ], { windowsHide: true, timeout: 45 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 })
    if (!existsSync(outputPath)) throw new Error('The reference video download did not produce an MP4 file')
    return outputPath
  }

  async extractAudioFile(videoPath: string, outputPath: string): Promise<string> {
    await mkdir(dirname(outputPath), { recursive: true })
    await exec(ffmpegPath(), ['-hide_banner','-loglevel','error','-i',videoPath,'-vn','-codec:a','libmp3lame','-q:a','0','-y',outputPath], { windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 })
    return outputPath
  }

  async detectSceneCuts(videoPath: string, durationSeconds: number): Promise<number[]> {
    try {
      const result = await exec(ffmpegPath(), ['-hide_banner','-i',videoPath,'-vf',"select='gt(scene,0.32)',showinfo",'-an','-f','null',process.platform === 'win32' ? 'NUL' : '/dev/null'], { windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 32 * 1024 * 1024 })
      const raw = `${result.stdout}\n${result.stderr}`.matchAll(/pts_time:([0-9.]+)/g)
      const detected = [...raw].map((match) => Number(match[1])).filter(Number.isFinite).sort((a,b) => a-b)
      const cuts = [0]
      for (const time of detected) if (time > cuts.at(-1)! + .45 && time < durationSeconds - .35) cuts.push(time)
      if (durationSeconds > cuts.at(-1)! + .35) cuts.push(durationSeconds)
      this.logger.info('Reference shot analysis complete', { cuts: Math.max(0, cuts.length - 1), durationSeconds })
      return cuts
    } catch (error) {
      this.logger.warn('Reference shot analysis failed; using rhythmic fallback cuts', { error: error instanceof Error ? error.message : String(error) })
      const cuts = [0]; for (let time = 3; time < durationSeconds; time += 3) cuts.push(time); cuts.push(durationSeconds); return cuts
    }
  }

  async prepareTranscriptionChunks(audioPath: string, outputDir: string): Promise<string[]> {
    await mkdir(outputDir, { recursive: true })
    for (const file of await readdir(outputDir)) if (/^chunk-\d+\.mp3$/.test(file)) await rm(join(outputDir, file), { force: true })
    const pattern = join(outputDir, 'chunk-%03d.mp3')
    await exec(ffmpegPath(), ['-hide_banner','-loglevel','error','-i',audioPath,'-vn','-ac','1','-ar','16000','-b:a','32k','-f','segment','-segment_time','600','-reset_timestamps','1','-y',pattern], { windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 })
    const chunks = (await readdir(outputDir)).filter((file) => /^chunk-\d+\.mp3$/.test(file)).sort().map((file) => join(outputDir,file))
    if (!chunks.length) throw new Error('FFmpeg did not create transcription audio chunks')
    this.logger.info('Prepared transcription chunks', { chunks: chunks.length })
    return chunks
  }
}
