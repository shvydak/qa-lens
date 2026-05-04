import {config, type AIProvider} from '../config.js'
import {getDb} from '../db/index.js'
import {isCommandAvailable} from './AIService.js'

export const ALL_AI_PROVIDERS: AIProvider[] = ['claude', 'gemini', 'anthropic']

export interface AIProviderInfo {
  id: AIProvider
  label: string
  available: boolean
  reason?: string
}

const PROVIDER_LABELS: Record<AIProvider, string> = {
  claude: 'Claude CLI',
  gemini: 'Gemini CLI',
  anthropic: 'Anthropic API',
}

export async function detectProviderAvailability(provider: AIProvider): Promise<AIProviderInfo> {
  const label = PROVIDER_LABELS[provider]
  if (provider === 'claude') {
    const available = await isCommandAvailable('claude')
    return {
      id: provider,
      label,
      available,
      reason: available ? undefined : 'claude CLI not installed on host',
    }
  }
  if (provider === 'gemini') {
    const available = await isCommandAvailable('gemini')
    return {
      id: provider,
      label,
      available,
      reason: available ? undefined : 'gemini CLI not installed on host',
    }
  }
  const available = Boolean(config.anthropicApiKey)
  return {
    id: provider,
    label,
    available,
    reason: available ? undefined : 'ANTHROPIC_API_KEY not set',
  }
}

export async function getAvailableProviders(): Promise<AIProviderInfo[]> {
  return Promise.all(ALL_AI_PROVIDERS.map(detectProviderAvailability))
}

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | {value: string}
    | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `
    )
    .run(key, value)
}

export function clearSetting(key: string): void {
  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(key)
}

export function getDefaultAIProvider(): AIProvider | null {
  const value = getSetting('default_ai_provider')
  if (!value) return null
  return ALL_AI_PROVIDERS.includes(value as AIProvider) ? (value as AIProvider) : null
}
