import { readFile, writeFile } from 'node:fs/promises'
import type { Logger } from 'winston'
import type { SettingsService } from './settings'

export interface TranscriptResult { text: string; language?: string; words: Array<{ word: string; start: number; end: number }> }
export interface PlannedScene { narration: string; topic: string; emotion: string; keywords: string[]; searchQuery?: string; duration: number; visualType: string; startMs?: number; endMs?: number }
export interface StockResult { id: string; provider: string; type: 'video' | 'image'; previewUrl: string; sourceUrl: string; width: number; height: number; duration?: number }
export type VisualDirection = 'general' | 'dark-motivation' | 'story'

export class ProviderHub {
  constructor(private settings: SettingsService, private logger: Logger) {}

  canTranscribe(): boolean { return !!this.settings.getApiKey('groq') }
  canSynthesizeVoice(): boolean { return !!this.settings.getApiKey('elevenlabs') }

  async synthesizeVoice(text: string, outputPath: string): Promise<string> {
    const key = this.settings.getApiKey('elevenlabs'); if (!key) throw new Error('ElevenLabs API key is not configured')
    const voiceId = 'JBFqnCBsd6RMkjVDRZzb'
    const chunks = text.match(/[\s\S]{1,4500}(?:\s|$)/g)?.map((part) => part.trim()).filter(Boolean) ?? [text.slice(0,4500)]
    const audio: Uint8Array[] = []
    for (const chunk of chunks) {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
        method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text: chunk, model_id: 'eleven_multilingual_v2', voice_settings: { stability: .52, similarity_boost: .76, style: .16, use_speaker_boost: true } })
      })
      if (!response.ok) throw new Error(`ElevenLabs narration failed (${response.status}): ${await response.text()}`)
      audio.push(new Uint8Array(await response.arrayBuffer()))
    }
    await writeFile(outputPath, Buffer.concat(audio.map((part) => Buffer.from(part))))
    return outputPath
  }

  async transcribe(audioPath: string): Promise<TranscriptResult> {
    const key = this.settings.getApiKey('groq')
    if (!key) throw new Error('Groq API key is not configured')
    const bytes = await readFile(audioPath)
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(bytes)]), 'source.mp3')
    form.append('model', 'whisper-large-v3-turbo')
    form.append('response_format', 'verbose_json')
    form.append('timestamp_granularities[]', 'word')
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form })
    if (!response.ok) throw new Error(`Groq transcription failed (${response.status}): ${await response.text()}`)
    const data = await response.json() as { text: string; language?: string; words?: Array<{ word: string; start: number; end: number }> }
    return { text: data.text, language: data.language, words: data.words ?? [] }
  }

  async transcribeChunks(paths: string[], chunkSeconds = 600): Promise<TranscriptResult> {
    const combined: TranscriptResult = { text: '', words: [] }
    for (const [index, path] of paths.entries()) {
      this.logger.info('Transcribing audio chunk', { chunk: index + 1, total: paths.length })
      const part = await this.transcribe(path); const offset = index * chunkSeconds
      combined.text += `${combined.text ? ' ' : ''}${part.text.trim()}`
      combined.language ??= part.language
      combined.words.push(...part.words.map((word) => ({ ...word, start: word.start + offset, end: word.end + offset })))
    }
    return combined
  }

  async planScenes(script: string, density: string, direction: VisualDirection = 'general'): Promise<PlannedScene[]> {
    const key = this.settings.getApiKey('groq')
    if (!key) return this.fallbackScenes(script, direction)
    const chunks = this.scriptChunks(script)
    const scenes: PlannedScene[] = []
    for (const [index, chunk] of chunks.entries()) {
      this.logger.info('Planning narration chunk', { chunk: index + 1, total: chunks.length })
      const prompt = `You are the visual director for a licensed-stock video. Divide EVERY word of the narration below into consecutive scenes for ${density} visual energy.
Return strict JSON as {"scenes":[{"narration":"exact consecutive source words","topic":"short human-readable label","emotion":"calm|curious|urgent|confident|inspiring","searchQuery":"one concrete English stock-video search phrase","keywords":["two alternate concrete stock phrases"],"duration":10,"visualType":"video|image|graphic"}]}.
Rules:
- The concatenated narration fields must preserve the complete input in the same order; do not summarize or omit claims.
- Target 20-38 spoken words (roughly 8-15 seconds) per scene.
- searchQuery must describe visible people/objects, action, and setting, not abstract themes. Example: use "young man writing goals in notebook at desk", not "success motivation".
- Make each query specific to that scene's spoken meaning and vary adjacent visuals.
- Prefer video. Use graphic only when a real-world visual cannot communicate the idea.
${this.directionGuide(direction)}
Narration chunk:\n${chunk}`
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.22, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] })
      })
      if (!response.ok) throw new Error(`Groq scene planning failed (${response.status})`)
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
      const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as { scenes?: PlannedScene[] }
      const planned = (parsed.scenes ?? []).filter((scene) => scene?.narration?.trim()).map((scene, sceneIndex) => ({
        narration: scene.narration.trim(), topic: scene.topic?.trim() || `Scene ${sceneIndex + 1}`,
        emotion: scene.emotion || 'confident', searchQuery: scene.searchQuery?.trim(),
        keywords: Array.isArray(scene.keywords) ? scene.keywords.map((value) => String(value).trim()).filter(Boolean) : [],
        duration: Number.isFinite(Number(scene.duration)) ? Math.max(5, Math.min(18, Number(scene.duration))) : Math.max(7, Math.min(15, Math.ceil(this.wordCount(scene.narration) / 2.6))),
        visualType: ['video','image','graphic'].includes(scene.visualType) ? scene.visualType : 'video'
      }))
      const sourceWords = this.wordCount(chunk); const plannedWords = planned.reduce((sum, scene) => sum + this.wordCount(scene.narration), 0)
      scenes.push(...(planned.length && plannedWords >= sourceWords * .78 ? planned : this.fallbackScenes(chunk, direction)))
    }
    return scenes.length ? scenes : this.fallbackScenes(script, direction)
  }

  async planTimedScenes(words: TranscriptResult['words'], cuts: number[], direction: VisualDirection = 'dark-motivation'): Promise<PlannedScene[]> {
    const segments = cuts.slice(0, -1).map((start, index) => {
      const end = cuts[index + 1]!
      let spoken = words.filter((word) => word.start < end && word.end >= start)
      if (!spoken.length) spoken = words.filter((word) => word.start >= Math.max(0, start - 1.5) && word.start < end + 1.5).slice(0, 8)
      const narration = spoken.map((word) => word.word).join(' ').trim() || 'Cinematic transition'
      const terms = this.concreteTerms(narration); const visibleTerms = terms.slice(0, 5).join(' ')
      const query = direction === 'story' ? (visibleTerms ? `cinematic story ${visibleTerms}` : 'cinematic story character journey') : (visibleTerms ? `dark cinematic intense ${visibleTerms}` : 'dark cinematic athlete training alone')
      const titleCard = /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:step|principle|rule)\b|\b(?:step|principle|rule)\s+(?:number\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i.test(narration)
      const alternate = direction === 'story' ? (visibleTerms ? `dramatic narrative ${visibleTerms}` : 'dramatic narrative character') : (visibleTerms ? `cinematic anime training ${visibleTerms}` : 'cinematic anime lone warrior training')
      const intensity = direction === 'story' ? `emotional cinematic ${visibleTerms || 'story scene'}` : 'bodybuilder dark gym intense workout'
      return { id: index, narration, topic: terms.slice(0, 2).join(' ') || `Scene ${index + 1}`, emotion: 'confident', searchQuery: query, keywords: [query, alternate, intensity], duration: end - start, visualType: titleCard ? 'graphic' : 'video', startMs: Math.round(start * 1000), endMs: Math.round(end * 1000) } satisfies PlannedScene & { id: number }
    })
    const key = this.settings.getApiKey('groq'); if (!key) return segments.map(({ id: _id, ...scene }) => scene)
    for (let offset = 0; offset < segments.length; offset += 24) {
      const batch = segments.slice(offset, offset + 24)
      const prompt = `For each timed narration segment, return a concrete licensed-stock visual direction. Return strict JSON as {"scenes":[{"id":0,"topic":"short label","emotion":"calm|curious|urgent|confident|inspiring","searchQuery":"specific visible subject action setting","keywords":["two alternate stock searches"],"visualType":"video|graphic"}]}.
${this.directionGuide(direction)} Describe what is visibly happening (person, action, location, lighting), never abstract words like success or motivation. Never mention celebrities, copyrighted titles, or characters. Preserve every id. Use graphic only for explicitly numbered step/principle/rule title cards.
Segments:\n${JSON.stringify(batch.map(({ id, narration }) => ({ id, narration })))}`
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: .2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }) })
        if (!response.ok) continue
        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
        const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as { scenes?: Array<{ id: number; topic?: string; emotion?: string; searchQuery?: string; keywords?: string[]; visualType?: string }> }
        const byId = new Map((parsed.scenes ?? []).map((scene) => [Number(scene.id), scene]))
        for (const segment of batch) {
          const direction = byId.get(segment.id); if (!direction) continue
          segment.topic = direction.topic?.trim() || segment.topic; segment.emotion = direction.emotion || segment.emotion
          segment.searchQuery = direction.searchQuery?.trim() || segment.searchQuery
          segment.keywords = [segment.searchQuery, ...(Array.isArray(direction.keywords) ? direction.keywords : [])].map((value) => value?.trim()).filter((value): value is string => !!value)
          if (segment.visualType !== 'graphic') segment.visualType = direction.visualType === 'graphic' ? 'graphic' : 'video'
        }
      } catch (error) { this.logger.warn('Timed visual direction batch failed', { offset, error: error instanceof Error ? error.message : String(error) }) }
    }
    return segments.map(({ id: _id, ...scene }) => scene)
  }

  async searchStock(query: string, orientation: string): Promise<StockResult[]> {
    const [pexels, pixabay] = await Promise.allSettled([this.searchPexels(query, orientation), this.searchPixabay(query, orientation)])
    return [...(pexels.status === 'fulfilled' ? pexels.value : []), ...(pixabay.status === 'fulfilled' ? pixabay.value : [])]
  }

  private async searchPexels(query: string, orientation: string): Promise<StockResult[]> {
    const key = this.settings.getApiKey('pexels'); if (!key) return []
    const preferred = orientation === '9:16' ? 'portrait' : orientation === '1:1' ? 'square' : 'landscape'
    const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${preferred}&per_page=6`, { headers: { Authorization: key } })
    if (!response.ok) return []
    const data = await response.json() as { videos?: Array<{ id: number; width: number; height: number; duration: number; image: string; video_files?: Array<{ file_type: string; quality: string; width: number; height: number; link: string }> }> }
    return (data.videos ?? []).flatMap((item) => {
      const files = (item.video_files ?? []).filter((file) => file.file_type === 'video/mp4' && file.link)
      const selected = files.sort((a, b) => {
        const aPreferred = a.quality === 'hd' ? 1 : 0; const bPreferred = b.quality === 'hd' ? 1 : 0
        return bPreferred - aPreferred || Math.abs(1080 - a.height) - Math.abs(1080 - b.height)
      })[0]
      return selected ? [{ id: String(item.id), provider: 'pexels', type: 'video' as const, previewUrl: item.image, sourceUrl: selected.link, width: selected.width, height: selected.height, duration: item.duration }] : []
    })
  }

  private async searchPixabay(query: string, orientation: string): Promise<StockResult[]> {
    const key = this.settings.getApiKey('pixabay'); if (!key) return []
    const response = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&orientation=${orientation === '9:16' ? 'vertical' : 'horizontal'}&per_page=6&safesearch=true`)
    if (!response.ok) return []
    const data = await response.json() as { hits?: Array<{ id: number; pageURL: string; duration: number; videos: { medium?: { url: string; width: number; height: number; thumbnail: string } } }> }
    return (data.hits ?? []).flatMap((item) => item.videos.medium ? [{ id: String(item.id), provider: 'pixabay', type: 'video' as const, previewUrl: item.videos.medium.thumbnail, sourceUrl: item.videos.medium.url, width: item.videos.medium.width, height: item.videos.medium.height, duration: item.duration }] : [])
  }

  private fallbackScenes(script: string, direction: VisualDirection = 'general'): PlannedScene[] {
    const text = script.trim() || 'Introduce the topic with a strong opening. Explain the central idea clearly. Show why this matters to the viewer. End with a memorable takeaway.'
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((value) => value.trim()).filter(Boolean) ?? [text]
    const groups: string[] = []; let current = ''
    for (const sentence of sentences) {
      if (current && this.wordCount(`${current} ${sentence}`) > 34) { groups.push(current); current = sentence }
      else current = `${current} ${sentence}`.trim()
    }
    if (current) groups.push(current)
    return groups.map((narration, index) => {
      const keywords = this.concreteTerms(narration)
      const visibleTerms = keywords.slice(0, 6).join(' ')
      const searchQuery = direction === 'story' ? `cinematic story ${visibleTerms || 'character journey'}` : direction === 'dark-motivation' ? `dark cinematic athlete ${visibleTerms || 'intense training'}` : visibleTerms || 'person working at desk'
      const alternate = direction === 'story' ? `dramatic narrative ${visibleTerms || 'emotional scene'}` : direction === 'dark-motivation' ? `cinematic anime training ${visibleTerms || 'lone warrior'}` : keywords.slice(1, 6).join(' ')
      return { narration, topic: keywords.slice(0, 2).join(' ') || `Scene ${index + 1}`, emotion: index === 0 ? 'curious' : index === groups.length - 1 ? 'inspiring' : 'confident', keywords: [searchQuery, alternate].filter(Boolean), searchQuery, duration: Math.max(7, Math.min(15, Math.ceil(this.wordCount(narration) / 2.6))), visualType: 'video' }
    })
  }

  private scriptChunks(script: string, maxCharacters = 2800): string[] {
    const sentences = script.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((value) => value.trim()).filter(Boolean) ?? [script.trim()]
    const chunks: string[] = []; let current = ''
    for (const sentence of sentences) {
      if (current && `${current} ${sentence}`.length > maxCharacters) { chunks.push(current); current = sentence }
      else current = `${current} ${sentence}`.trim()
    }
    if (current) chunks.push(current)
    return chunks.length ? chunks : ['Create an engaging original story.']
  }

  private wordCount(value: string): number { return value.trim().split(/\s+/).filter(Boolean).length }

  private directionGuide(direction: VisualDirection): string {
    if (direction === 'story') return 'Maintain narrative continuity: match the current character, action, location, time of day, emotional beat, and cause-and-effect of the story. Do not insert generic gym or motivation footage unless the narration calls for it.'
    if (direction === 'dark-motivation') return 'Use a varied dark motivational palette where relevant: elite endurance training, lone runners, bodybuilders in shadowy gyms, boxing or combat practice, rain, early-morning discipline, failure and recovery, moody city/night imagery, and cinematic animated alternatives. Match each choice to the spoken meaning; do not repeat generic workouts.'
    return 'Choose a cinematic real-world visual that directly represents the spoken meaning.'
  }

  private concreteTerms(value: string): string[] {
    const stop = new Set(['about','after','again','against','because','before','being','could','every','from','have','into','just','more','other','should','some','than','that','their','them','then','there','these','they','this','those','through','very','what','when','where','which','while','with','would','your'])
    return [...new Set(value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 3 && !stop.has(word)))].slice(0, 8)
  }
}
