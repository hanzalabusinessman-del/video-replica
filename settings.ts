import { safeStorage } from 'electron'
import type { ProjectDatabase } from './database'

const envNames = { groq: 'GROQ_API_KEY', elevenlabs: 'ELEVENLABS_API_KEY', pixabay: 'PIXABAY_API_KEY', pexels: 'PEXELS_API_KEY' } as const
export type ProviderName = keyof typeof envNames

export class SettingsService {
  constructor(private database: ProjectDatabase) {}

  getApiKey(provider: ProviderName): string | undefined {
    const fromEnvironment = process.env[envNames[provider]]?.trim()
    if (fromEnvironment) return fromEnvironment
    const stored = this.database.getSetting(`provider.${provider}`)
    if (!stored) return undefined
    try {
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(stored, 'base64')) : undefined
    } catch { return undefined }
  }

  saveApiKey(provider: ProviderName, value: string): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is not available on this device')
    const encrypted = safeStorage.encryptString(value.trim()).toString('base64')
    this.database.setSetting(`provider.${provider}`, encrypted)
  }

  status(): Record<ProviderName, boolean> {
    return { groq: !!this.getApiKey('groq'), elevenlabs: !!this.getApiKey('elevenlabs'), pixabay: !!this.getApiKey('pixabay'), pexels: !!this.getApiKey('pexels') }
  }
}
