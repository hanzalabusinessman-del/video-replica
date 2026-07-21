export type VideoMode = 'original' | 'story' | 'ai-voice' | 'hybrid' | 'custom'
export type AspectRatio = '16:9' | '9:16' | '1:1'
export type Resolution = '1080p' | '1440p' | '4K'
export type VisualDensity = 'minimal' | 'balanced' | 'dynamic' | 'viral'
export type ProjectStatus = 'draft' | 'processing' | 'ready' | 'rendering' | 'complete' | 'failed'
export type JobStatus = 'queued' | 'running' | 'paused' | 'complete' | 'failed' | 'cancelled'

export interface CreateProjectInput {
  name: string
  sourceUrls: string[]
  mode: VideoMode
  template: string
  aspectRatio: AspectRatio
  resolution: Resolution
  density: VisualDensity
  customScript?: string
}

export interface ProjectSummary extends CreateProjectInput {
  id: string
  status: ProjectStatus
  progress: number
  duration: number
  productionScore: number
  thumbnail?: string
  createdAt: string
  updatedAt: string
}

export interface Scene {
  id: string
  position: number
  startMs: number
  endMs: number
  narration: string
  topic: string
  emotion: string
  keywords: string[]
  visualType: string
  assetUrl?: string
  qualityScore: number
}

export interface TimelineClip {
  id: string
  sceneId?: string
  label: string
  startMs: number
  durationMs: number
  color: string
  source?: string
}

export interface TimelineTrack {
  id: string
  type: 'video' | 'audio' | 'caption' | 'graphic'
  label: string
  clips: TimelineClip[]
}

export interface ProjectDetail extends ProjectSummary {
  scenes: Scene[]
  tracks: TimelineTrack[]
}

export interface JobUpdate {
  id: string
  projectId: string
  status: JobStatus
  stage: string
  progress: number
  detail: string
  error?: string
  createdAt?: string
}

export interface ToolStatus {
  name: string
  available: boolean
  version?: string
  path?: string
}

export interface ImportedMedia {
  path: string
  name: string
  kind: 'video' | 'image' | 'audio'
}

export interface SystemSnapshot {
  platform: string
  cpuModel: string
  cpuCores: number
  totalMemoryGb: number
  freeMemoryGb: number
  userDataPath: string
  tools: ToolStatus[]
  providers: Record<'groq' | 'elevenlabs' | 'pixabay' | 'pexels', boolean>
}

export interface TemplateDefinition {
  id: string
  name: string
  category: string
  description: string
  accent: string
  icon: string
}

export interface VideoReplicaApi {
  system: { snapshot(): Promise<SystemSnapshot>; openFolder(kind: string): Promise<void>; showItem(path: string): Promise<void>; pickMedia(): Promise<ImportedMedia | null> }
  projects: {
    list(): Promise<ProjectSummary[]>
    get(id: string): Promise<ProjectDetail | null>
    create(input: CreateProjectInput): Promise<ProjectSummary>
    update(id: string, patch: Partial<CreateProjectInput>): Promise<ProjectSummary>
    saveTimeline(id: string, tracks: TimelineTrack[]): Promise<void>
    remove(id: string): Promise<void>
  }
  jobs: { start(projectId: string): Promise<JobUpdate>; cancel(jobId: string): Promise<void>; list(): Promise<JobUpdate[]> }
  renders: { export(projectId: string): Promise<string | null> }
  settings: { providerStatus(): Promise<SystemSnapshot['providers']>; saveApiKey(provider: string, value: string): Promise<void> }
  onJobUpdate(callback: (update: JobUpdate) => void): () => void
}

export const templates: TemplateDefinition[] = [
  { id: 'dark-motivation', name: 'Dark Motivation', category: 'Motivation', description: 'Intense athletes, bodybuilders, runners, combat training, dark cinematic and animated imagery.', accent: '#d8a94a', icon: 'Dumbbell' },
  { id: 'story', name: 'Cinematic Story', category: 'Storytelling', description: 'Continuity-aware characters, actions, locations, emotion, and story-beat visuals.', accent: '#7ba6ff', icon: 'BookOpen' },
  { id: 'documentary', name: 'Cinematic Documentary', category: 'Documentary', description: 'Measured pacing, elegant captions, cinematic B-roll.', accent: '#d8a94a', icon: 'Film' },
  { id: 'technology', name: 'Future Tech', category: 'Technology', description: 'Crisp motion, blue highlights, fast visual rhythm.', accent: '#59b8ff', icon: 'Cpu' },
  { id: 'business', name: 'Modern Business', category: 'Business', description: 'Confident type, polished graphics, professional energy.', accent: '#a58bfa', icon: 'BriefcaseBusiness' },
  { id: 'health', name: 'Health & Wellness', category: 'Health', description: 'Bright natural imagery with calm, trusted pacing.', accent: '#67d7a5', icon: 'HeartPulse' },
  { id: 'finance', name: 'Market Intelligence', category: 'Finance', description: 'Data-driven visuals, number cards, premium dark styling.', accent: '#e6bd63', icon: 'ChartNoAxesCombined' },
  { id: 'podcast', name: 'Social Podcast', category: 'Podcast', description: 'Bold kinetic captions designed for high retention.', accent: '#ff7d62', icon: 'Mic2' }
]

export const pipelineStages = [
  ['preparing', 'Preparing production workspace'],
  ['downloading', 'Extracting source audio'],
  ['transcribing', 'Creating word-accurate transcript'],
  ['analyzing', 'Understanding story, emotion, and hooks'],
  ['scripting', 'Refining narration and structure'],
  ['planning', 'Directing scenes and visual rhythm'],
  ['searching', 'Discovering licensed stock media'],
  ['composing', 'Building the multi-track timeline'],
  ['captions', 'Designing kinetic captions'],
  ['quality', 'Reviewing production quality'],
  ['ready', 'Your first cut is ready']
] as const
