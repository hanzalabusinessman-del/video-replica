import { z } from 'zod'

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(100),
  sourceUrls: z.array(z.string().url()).max(25),
  mode: z.enum(['original', 'story', 'ai-voice', 'hybrid', 'custom']),
  template: z.string().min(1).max(50),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  resolution: z.enum(['1080p', '1440p', '4K']),
  density: z.enum(['minimal', 'balanced', 'dynamic', 'viral']),
  customScript: z.string().max(50000).optional()
}).superRefine((data, ctx) => {
  if (data.mode !== 'custom' && data.sourceUrls.length === 0) ctx.addIssue({ code: 'custom', message: 'Add at least one source URL', path: ['sourceUrls'] })
  if (data.mode === 'custom' && !data.customScript?.trim()) ctx.addIssue({ code: 'custom', message: 'A custom script is required', path: ['customScript'] })
})

export const projectIdSchema = z.string().uuid()
export const providerSchema = z.enum(['groq', 'elevenlabs', 'pixabay', 'pexels'])
export const timelineSchema = z.array(z.object({
  id: z.string().min(1).max(100),
  type: z.enum(['video', 'audio', 'caption', 'graphic']),
  label: z.string().min(1).max(200),
  clips: z.array(z.object({
    id: z.string().min(1).max(160),
    sceneId: z.string().max(100).optional(),
    label: z.string().min(1).max(300),
    startMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
    durationMs: z.number().int().min(100).max(24 * 60 * 60 * 1000),
    color: z.string().min(1).max(40),
    source: z.string().max(4096).optional()
  })).max(2000)
})).max(32)
