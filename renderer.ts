import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { Logger } from 'winston'
import type { ProjectDatabase } from './database'
import type { RuntimePaths } from './paths'
import { ffmpegPath } from './tooling'

const exec = promisify(execFile)
const palette = ['0x171b22', '0x211a24', '0x262018', '0x17231f', '0x24191c']

function canvas(resolution: string, aspect: string): [number, number] {
  const base = resolution === '4K' ? 2160 : resolution === '1440p' ? 1440 : 1080
  if (aspect === '9:16') return [base, Math.round(base * 16 / 9)]
  if (aspect === '1:1') return [base, base]
  return [Math.round(base * 16 / 9), base]
}

interface CaptionWord { word: string; start: number; end: number }

function assTime(seconds: number): string {
  const safe = Math.max(0, seconds); const hours = Math.floor(safe / 3600); const minutes = Math.floor((safe % 3600) / 60); const wholeSeconds = Math.floor(safe % 60); const centiseconds = Math.floor((safe % 1) * 100)
  return `${hours}:${String(minutes).padStart(2,'0')}:${String(wholeSeconds).padStart(2,'0')}.${String(centiseconds).padStart(2,'0')}`
}

function assText(value: string): string { return value.replace(/\\/g, '/').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N').trim() }

function wrapCaption(value: string, maxCharacters: number): string {
  const words = assText(value).split(/\s+/); const lines: string[] = []; let line = ''
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxCharacters) { lines.push(line); line = word }
    else line = `${line} ${word}`.trim()
  }
  if (line) lines.push(line)
  return lines.slice(0, 4).join('\\N')
}

function captionPhrases(words: CaptionWord[]): CaptionWord[][] {
  const phrases: CaptionWord[][] = []; let current: CaptionWord[] = []
  for (const word of words) {
    current.push(word)
    const duration = current.length ? word.end - current[0]!.start : 0
    if (current.length >= 5 || duration >= 2.2 || /[.!?,;:]$/.test(word.word)) { phrases.push(current); current = [] }
  }
  if (current.length) phrases.push(current)
  return phrases
}

function buildAss(width: number, height: number, scenes: Array<{ startMs: number; endMs: number; topic: string; narration: string; visualType?: string }>, words: CaptionWord[], referenceStyle = false): string {
  const scale = Math.max(.72, Math.min(1.45, height / 1080)); const horizontal = width >= height
  const topicSize = Math.round(28 * scale); const headlineSize = Math.round((horizontal ? 58 : 48) * scale); const kineticSize = Math.round((referenceStyle ? (horizontal ? 46 : 54) : (horizontal ? 42 : 50)) * scale)
  const leftMargin = Math.round(width * (horizontal ? .075 : .065)); const rightMargin = Math.round(width * (horizontal ? .37 : .065)); const headlineTop = Math.round(height * (horizontal ? .19 : .14)); const kineticBottom = Math.round(height * (horizontal ? .1 : .14))
  const lines = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${width}`, `PlayResY: ${height}`, 'ScaledBorderAndShadow: yes', 'WrapStyle: 2', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Topic,Arial,${topicSize},&H005EADD7,&H005EADD7,&HCC000000,&H55000000,0,0,0,0,100,100,2,0,1,1.4,1,7,${leftMargin},${rightMargin},${headlineTop},1`,
    `Style: Headline,Georgia,${headlineSize},&H00FFFFFF,&H00FFFFFF,&HCC000000,&H66000000,0,0,0,0,100,100,0,0,1,2.2,1.5,7,${leftMargin},${rightMargin},${headlineTop + Math.round(45 * scale)},1`,
    `Style: Kinetic,Arial,${kineticSize},&H00FFFFFF,&H00FFFFFF,&HE6000000,&H66000000,-1,0,0,0,100,100,0,0,1,${referenceStyle ? 3.2 : 2.4},${referenceStyle ? 0 : 1.2},2,${Math.round(width * .06)},${Math.round(width * .06)},${kineticBottom},1`,
    `Style: TitleCard,Arial,${Math.round(72 * scale)},&H00FFFFFF,&H00FFFFFF,&HE6000000,&H66000000,-1,0,0,0,100,100,2,0,1,2.5,0,5,${Math.round(width * .06)},${Math.round(width * .06)},0,1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ]
  if (referenceStyle) {
    for (const scene of scenes.filter((item) => item.visualType === 'graphic')) {
      const ordinal = scene.narration.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:step|principle|rule)\b|\b(?:step|principle|rule)\s+(?:number\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i)
      const label = ordinal?.[1] ?? ordinal?.[2]
      if (label) lines.push(`Dialogue: 1,${assTime(scene.startMs / 1000)},${assTime(scene.endMs / 1000)},TitleCard,,0,0,0,,STEP · ${assText(label).toUpperCase()}`)
    }
    for (const [index, word] of words.entries()) {
      const next = words[index + 1]; const end = Math.max(word.end + .08, Math.min(next?.start ?? word.end + .35, word.end + .55))
      lines.push(`Dialogue: 2,${assTime(word.start)},${assTime(end)},Kinetic,,0,0,0,,${assText(word.word)}`)
    }
  } else {
    for (const scene of scenes) {
      const start = assTime(scene.startMs / 1000); const end = assTime(scene.endMs / 1000)
      lines.push(`Dialogue: 0,${start},${end},Topic,,0,0,0,,${assText(scene.topic).toUpperCase()}`)
      lines.push(`Dialogue: 0,${start},${end},Headline,,0,0,0,,${wrapCaption(scene.narration, horizontal ? 45 : 25)}`)
    }
    for (const phrase of captionPhrases(words)) {
      const phraseEnd = Math.max(phrase.at(-1)!.end + .16, phrase[0]!.start + .2)
      for (const [activeIndex, active] of phrase.entries()) {
        const end = phrase[activeIndex + 1]?.start ?? phraseEnd
        const text = phrase.map((word, index) => `{\\c&${index === activeIndex ? 'H005FC7F0' : 'H00FFFFFF'}&}${assText(word.word).toUpperCase()}`).join(' ')
        lines.push(`Dialogue: 2,${assTime(active.start)},${assTime(end)},Kinetic,,0,0,0,,${text}`)
      }
    }
  }
  return `${lines.join('\n')}\n`
}

export class RenderService {
  constructor(private database: ProjectDatabase, private paths: RuntimePaths, private logger: Logger) {}

  async export(projectId: string, outputPath: string): Promise<string> {
    const project = this.database.getProject(projectId)
    if (!project?.scenes.length) throw new Error('This production has no scenes to render yet')
    const renderDir = join(await this.paths.ensureProject(projectId), 'renders', `export-${Date.now()}`)
    await mkdir(renderDir, { recursive: true })
    const [width, height] = canvas(project.resolution, project.aspectRatio)
    const args: string[] = []; const filters: string[] = []; const labels: string[] = []
    const transcriptPath = join(this.paths.project(projectId), 'transcript', 'transcript.json')
    const referenceStyle = existsSync(join(this.paths.project(projectId), 'source', 'reference.mp4'))
    let captionWords: CaptionWord[] = []
    if (existsSync(transcriptPath)) {
      try { captionWords = (JSON.parse(await readFile(transcriptPath, 'utf8')) as { words?: CaptionWord[] }).words?.filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.word.trim()) ?? [] } catch { captionWords = [] }
    }
    const transcriptEndMs = Math.round((captionWords.at(-1)?.end ?? 0) * 1000)
    const visualClips = project.tracks.find((track) => track.type === 'video')?.clips.slice().sort((a,b) => a.startMs - b.startMs) ?? []
    const editedTimeline = visualClips.length > 0
    const sceneEndMs = project.scenes.at(-1)!.endMs
    const timelineScale = !editedTimeline && transcriptEndMs > sceneEndMs * 1.2 ? transcriptEndMs / sceneEndMs : 1
    const renderScenes = editedTimeline ? visualClips.map((clip, index) => {
      const scene = project.scenes.find((item) => item.id === clip.sceneId) ?? project.scenes[Number(clip.id.match(/^v-(\d+)/)?.[1] ?? index)] ?? project.scenes[Math.min(index, project.scenes.length - 1)]!
      return { ...scene, topic: clip.label, startMs: clip.startMs, endMs: clip.startMs + clip.durationMs, assetUrl: clip.source ?? scene.assetUrl }
    }) : project.scenes.map((scene) => ({ ...scene, startMs: Math.round(scene.startMs * timelineScale), endMs: Math.round(scene.endMs * timelineScale) }))

    for (const [index, scene] of renderScenes.entries()) {
      const duration = Math.max(.5, (scene.endMs - scene.startMs) / 1000)
      const asset = scene.assetUrl ? await this.downloadAsset(scene.assetUrl, renderDir, index) : undefined
      if (asset?.kind === 'video') args.push('-stream_loop','-1','-t',String(duration),'-i',asset.path)
      else if (asset?.kind === 'image') args.push('-loop','1','-framerate','30','-t',String(duration),'-i',asset.path)
      else args.push('-f','lavfi','-t',String(duration),'-i',`color=c=${referenceStyle && scene.visualType === 'graphic' ? '0x050505' : palette[index % palette.length]}:s=${width}x${height}:r=30`)
      const fadeOut = Math.max(.25, duration - .25)
      filters.push(`[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=30,trim=duration=${duration},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.2,fade=t=out:st=${fadeOut}:d=0.2,format=yuv420p[v${index}]`)
      labels.push(`[v${index}]`)
    }

    const totalSeconds = Math.max(1, project.duration / 1000, renderScenes.at(-1)!.endMs / 1000, transcriptEndMs / 1000)
    const audioIndex = renderScenes.length
    const generatedVoice = join(this.paths.project(projectId), 'voice', 'narration.mp3')
    const originalVoice = join(this.paths.project(projectId), 'source', 'source-audio.mp3')
    const narration = existsSync(generatedVoice) ? generatedVoice : existsSync(originalVoice) ? originalVoice : undefined
    if (narration) args.push('-i', narration)
    else args.push('-f','lavfi','-t',String(totalSeconds),'-i','anullsrc=channel_layout=stereo:sample_rate=48000')
    const narrationClip = project.tracks.find((track) => track.id === 'narration')?.clips[0]
    const narrationDuration = Math.max(.1, Math.min(totalSeconds, (narrationClip?.durationMs ?? totalSeconds * 1000) / 1000))
    const narrationDelay = Math.max(0, narrationClip?.startMs ?? 0)
    filters.push(`[${audioIndex}:a]atrim=duration=${narrationDuration},asetpts=PTS-STARTPTS,adelay=${narrationDelay}|${narrationDelay}[narration]`)
    const audioLabels = ['[narration]']; let nextAudioIndex = audioIndex + 1
    for (const clip of project.tracks.filter((track) => track.type === 'audio').flatMap((track) => track.clips).filter((clip) => !!clip.source)) {
      const source = clip.source!; const localPath = source.startsWith('file:') ? fileURLToPath(source) : isAbsolute(source) ? source : undefined
      if (!localPath || !existsSync(localPath)) continue
      args.push('-i', localPath); const label = `audio${nextAudioIndex}`; const delay = Math.max(0, clip.startMs)
      filters.push(`[${nextAudioIndex}:a]atrim=duration=${Math.max(.1, clip.durationMs / 1000)},asetpts=PTS-STARTPTS,adelay=${delay}|${delay},volume=0.65[${label}]`)
      audioLabels.push(`[${label}]`); nextAudioIndex++
    }
    const captionsPath = join(renderDir, 'captions.ass')
    const fallbackWords = captionWords.length ? captionWords : renderScenes.flatMap((scene) => {
      const values = scene.narration.split(/\s+/).filter(Boolean); const duration = (scene.endMs - scene.startMs) / 1000
      return values.map((word, index) => ({ word, start: scene.startMs / 1000 + duration * index / values.length, end: scene.startMs / 1000 + duration * (index + 1) / values.length }))
    })
    await writeFile(captionsPath, buildAss(width, height, renderScenes, fallbackWords, referenceStyle), 'utf8')
    filters.push(renderScenes.length === 1 ? `${labels[0]}null[base]` : `${labels.join('')}concat=n=${renderScenes.length}:v=1:a=0[base]`)
    filters.push(`[base]drawbox=x=0:y=0:w=iw:h=ih:color=black@${referenceStyle ? '0.08' : '0.14'}:t=fill,ass=filename=captions.ass[vout]`)
    filters.push(audioLabels.length === 1 ? `${audioLabels[0]}anull[aout]` : `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0[aout]`)

    args.push('-filter_complex',filters.join(';'),'-map','[vout]','-map','[aout]','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-t',String(totalSeconds),'-y',outputPath)
    this.logger.info('Starting FFmpeg export', { projectId, outputPath, width, height, scenes: renderScenes.length, timelineEdited: editedTimeline })
    try { await exec(ffmpegPath(), args, { cwd: renderDir, windowsHide: true, timeout: 2 * 60 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 }) }
    catch (error) { this.logger.error('FFmpeg export failed', { projectId, error: error instanceof Error ? error.message : String(error) }); throw new Error('FFmpeg could not render this production. See Logs for details.') }
    this.logger.info('Export complete', { projectId, outputPath })
    return outputPath
  }

  private async downloadAsset(url: string, outputDir: string, index: number): Promise<{ path: string; kind: 'image' | 'video' } | undefined> {
    try {
      const localPath = url.startsWith('file:') ? fileURLToPath(url) : isAbsolute(url) ? url : undefined
      if (localPath && existsSync(localPath)) return { path: localPath, kind: /\.(?:mp4|mov|mkv|webm)$/i.test(extname(localPath)) ? 'video' : 'image' }
      const parsed = new URL(url); if (parsed.protocol !== 'https:') return undefined
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) }); if (!response.ok) return undefined
      const type = (response.headers.get('content-type') ?? '').toLowerCase()
      const kind = type.startsWith('video/') || /\.mp4(?:$|\?)/i.test(url) ? 'video' : type.startsWith('image/') ? 'image' : undefined
      if (!kind) return undefined
      const output = join(outputDir, `scene-${index}.${kind === 'video' ? 'mp4' : 'jpg'}`)
      await writeFile(output, new Uint8Array(await response.arrayBuffer())); return { path: output, kind }
    } catch { return undefined }
  }
}
