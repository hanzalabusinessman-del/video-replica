import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import PQueue from 'p-queue'
import type { Logger } from 'winston'
import type { JobUpdate, Scene, TimelineTrack } from '../../shared/types'
import { pipelineStages } from '../../shared/types'
import type { ProjectDatabase } from './database'
import type { RuntimePaths } from './paths'
import type { ProviderHub, PlannedScene, TranscriptResult } from './providers'
import type { MediaService } from './media'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class ProductionPipeline extends EventEmitter {
  private queue = new PQueue({ concurrency: 2 })
  private cancelled = new Set<string>()
  constructor(private database: ProjectDatabase, private paths: RuntimePaths, private providers: ProviderHub, private media: MediaService, private logger: Logger) { super() }

  async start(projectId: string): Promise<JobUpdate> {
    const existing = this.database.getProject(projectId); if (!existing) throw new Error('Project not found')
    const active = this.database.activeJob(projectId)
    if (active) return { ...active, status: active.status as JobUpdate['status'] }
    const id = this.database.createJob(projectId)
    const initial: JobUpdate = { id, projectId, status: 'queued', stage: 'queued', progress: 0, detail: 'Waiting for an available worker', createdAt: new Date().toISOString() }
    this.emit('update', initial)
    void this.queue.add(() => this.process(initial))
    return initial
  }

  cancel(jobId: string): void { this.cancelled.add(jobId) }

  private publish(job: JobUpdate): void {
    this.database.updateJob(job.id, job.status, job.stage, job.progress, job.detail, job.error)
    this.database.updateProject(job.projectId, { status: job.status === 'failed' ? 'failed' : job.status === 'complete' ? 'ready' : 'processing', progress: job.progress })
    this.emit('update', job)
  }

  private async process(initial: JobUpdate): Promise<void> {
    let job: JobUpdate = { ...initial, status: 'running' }
    try {
      const project = this.database.getProject(job.projectId); if (!project) throw new Error('Project disappeared')
      const projectPath = await this.paths.ensureProject(project.id)
      let script = project.customScript?.trim() || ''
      let transcriptWords: TranscriptResult['words'] = []
      let shotCuts: number[] = []
      let audioPath: string | undefined
      const referencePath = join(projectPath, 'source', 'reference.mp4')
      const sourceAudioPath = join(projectPath, 'source', 'source-audio.mp3')
      const transcriptTextPath = join(projectPath, 'transcript', 'transcript.txt')
      const transcriptJsonPath = join(projectPath, 'transcript', 'transcript.json')
      if (!script && existsSync(transcriptTextPath)) {
        script = (await readFile(transcriptTextPath, 'utf8')).trim()
        if (existsSync(transcriptJsonPath)) {
          try { transcriptWords = (JSON.parse(await readFile(transcriptJsonPath, 'utf8')) as TranscriptResult).words ?? [] } catch { transcriptWords = [] }
        }
        this.logger.info('Reusing cached transcript', { projectId: project.id, words: transcriptWords.length })
      }
      for (let index = 0; index < pipelineStages.length; index++) {
        if (this.cancelled.has(job.id)) { job = { ...job, status: 'cancelled', detail: 'Generation cancelled' }; this.publish(job); return }
        const [stage, detail] = pipelineStages[index]!
        job = { ...job, stage, progress: Math.round((index / (pipelineStages.length - 1)) * 100), detail }
        this.publish(job)
        if (stage === 'preparing') await writeFile(join(projectPath, 'project.json'), JSON.stringify(project, null, 2))
        if (stage === 'downloading' && project.sourceUrls[0]) {
          try {
            if (!existsSync(referencePath)) await this.media.downloadReferenceVideo(project.sourceUrls[0], referencePath)
            audioPath = existsSync(sourceAudioPath) ? sourceAudioPath : await this.media.extractAudioFile(referencePath, sourceAudioPath)
          } catch (error) {
            this.logger.warn('Reference video analysis download failed; retaining audio-first workflow', { projectId: project.id, error: error instanceof Error ? error.message : String(error) })
            if (existsSync(sourceAudioPath)) audioPath = sourceAudioPath
            else if (!script && this.providers.canTranscribe()) audioPath = await this.media.extractAudio(project.sourceUrls[0], sourceAudioPath)
          }
        }
        if (stage === 'transcribing' && !script) {
          if (audioPath) {
            const chunks = await this.media.prepareTranscriptionChunks(audioPath, join(projectPath, 'transcript', 'chunks'))
            const transcript = await this.providers.transcribeChunks(chunks)
            script = transcript.text; transcriptWords = transcript.words
            await writeFile(join(projectPath, 'transcript', 'transcript.json'), JSON.stringify(transcript, null, 2))
          } else script = `Create an engaging original video about ${project.name}. Open with a compelling question. Explain the topic with clear examples. Finish with a practical, memorable takeaway.`
          await writeFile(join(projectPath, 'transcript', 'transcript.txt'), script)
        }
        if (stage === 'analyzing' && existsSync(referencePath) && transcriptWords.length) {
          shotCuts = await this.media.detectSceneCuts(referencePath, Math.max(1, transcriptWords.at(-1)!.end))
        }
        if (stage === 'scripting' && ['ai-voice','custom'].includes(project.mode) && this.providers.canSynthesizeVoice()) {
          await this.providers.synthesizeVoice(script, join(projectPath, 'voice', 'narration.mp3'))
        }
        if (stage === 'planning') {
          const direction = project.mode === 'story' || project.template === 'story' ? 'story' : project.template === 'dark-motivation' ? 'dark-motivation' : 'general'
          const planned = shotCuts.length > 2 && transcriptWords.length ? await this.providers.planTimedScenes(transcriptWords, shotCuts, direction) : await this.providers.planScenes(script, project.density, direction)
          await this.compose(project.id, project.aspectRatio, planned, transcriptWords)
        }
        await wait(stage === 'searching' ? 650 : 300)
      }
      const detail = this.database.getProject(project.id)
      const score = detail ? Math.min(97, 78 + Math.min(detail.scenes.length, 12)) : 84
      this.database.updateProject(project.id, { productionScore: score, duration: detail?.scenes.at(-1)?.endMs ?? 0 })
      job = { ...job, status: 'complete', stage: 'ready', progress: 100, detail: 'Your first cut is ready' }
      this.publish(job)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('Pipeline failed', { jobId: job.id, error: message })
      job = { ...job, status: 'failed', detail: 'Generation stopped', error: message }
      this.publish(job)
    }
  }

  private async compose(projectId: string, aspectRatio: string, planned: PlannedScene[], transcriptWords: TranscriptResult['words'] = []): Promise<void> {
    let cursor = 0
    const scenes: Omit<Scene, 'id'>[] = []
    const usedAssets = new Set<string>()
    const totalPlannedWords = Math.max(1, planned.reduce((sum, scene) => sum + scene.narration.trim().split(/\s+/).filter(Boolean).length, 0))
    let plannedWordsSeen = 0
    for (const [position, plan] of planned.entries()) {
      plannedWordsSeen += plan.narration.trim().split(/\s+/).filter(Boolean).length
      const transcriptIndex = Math.min(transcriptWords.length - 1, Math.max(0, Math.round((plannedWordsSeen / totalPlannedWords) * transcriptWords.length) - 1))
      const alignedEnd = transcriptWords.length ? Math.round((transcriptWords[transcriptIndex]?.end ?? cursor / 1000 + plan.duration) * 1000) : cursor + Math.round(plan.duration * 1000)
      const sceneStartMs = plan.startMs ?? cursor
      const sceneEndMs = plan.endMs ?? Math.max(sceneStartMs + 750, alignedEnd)
      const durationMs = Math.max(500, sceneEndMs - sceneStartMs)
      let assetUrl: string | undefined
      let selectedType = plan.visualType
      const queries = [...new Set([plan.searchQuery, ...plan.keywords, plan.topic].map((query) => query?.trim()).filter((query): query is string => !!query))].slice(0, 3)
      if (selectedType !== 'graphic') {
        for (const query of queries) {
          const results = await this.providers.searchStock(query, aspectRatio)
          const selected = results.find((asset) => !usedAssets.has(`${asset.provider}:${asset.id}`))
          if (selected) { usedAssets.add(`${selected.provider}:${selected.id}`); assetUrl = selected.sourceUrl; selectedType = selected.type; break }
        }
      }
      scenes.push({ position, startMs: sceneStartMs, endMs: sceneStartMs + durationMs, narration: plan.narration, topic: plan.topic, emotion: plan.emotion, keywords: queries, visualType: selectedType, assetUrl, qualityScore: assetUrl ? 92 : selectedType === 'graphic' ? 88 : 68 })
      cursor = sceneStartMs + durationMs
    }
    this.database.replaceScenes(projectId, scenes)
    const sceneIds = new Map(this.database.getProject(projectId)!.scenes.map((scene) => [scene.position, scene.id]))
    const palette = ['#5e86ff','#b06df6','#dc9d42','#57b99a','#e66b78']
    const tracks: TimelineTrack[] = [
      { id: 'visuals', type: 'video', label: 'Primary visuals', clips: scenes.map((scene) => ({ id: `v-${scene.position}`, sceneId: sceneIds.get(scene.position), label: scene.topic, startMs: scene.startMs, durationMs: scene.endMs - scene.startMs, color: palette[scene.position % palette.length]!, source: scene.assetUrl })) },
      { id: 'graphics', type: 'graphic', label: 'Motion graphics', clips: scenes.filter((_, index) => index % 3 === 1).map((scene) => ({ id: `g-${scene.position}`, label: 'Smart overlay', startMs: scene.startMs + 600, durationMs: Math.min(1800, scene.endMs - scene.startMs - 600), color: '#d8a94a' })) },
      { id: 'captions', type: 'caption', label: 'Kinetic captions', clips: scenes.map((scene) => ({ id: `c-${scene.position}`, label: scene.narration.split(/\s+/).slice(0, 4).join(' '), startMs: scene.startMs, durationMs: scene.endMs - scene.startMs, color: '#e8e4dc' })) },
      { id: 'narration', type: 'audio', label: 'Narration', clips: [{ id: 'a-narration', label: 'Narration', startMs: 0, durationMs: cursor, color: '#55bd8b' }] },
      { id: 'music', type: 'audio', label: 'Background music', clips: [{ id: 'a-music', label: 'Adaptive score', startMs: 0, durationMs: cursor, color: '#9a75df' }] }
    ]
    this.database.saveTimeline(projectId, tracks)
  }
}
