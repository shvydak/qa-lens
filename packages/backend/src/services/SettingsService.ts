import {config, type AIProvider, type CLIModelProvider} from '../config.js'
import {getDb} from '../db/index.js'
import {isCommandAvailable} from './AIService.js'

export const ALL_AI_PROVIDERS: AIProvider[] = ['claude', 'gemini', 'cursor', 'anthropic']
export const MODEL_CONFIGURABLE_PROVIDERS: CLIModelProvider[] = ['claude', 'gemini', 'cursor']

export interface AIProviderInfo {
  id: AIProvider
  label: string
  available: boolean
  reason?: string
}

export interface AIModelOption {
  id: string
  label: string
  source: 'known' | 'configured' | 'saved'
}

const PROVIDER_LABELS: Record<AIProvider, string> = {
  claude: 'Claude CLI',
  gemini: 'Gemini CLI',
  cursor: 'Cursor CLI',
  anthropic: 'Anthropic API',
}

const KNOWN_CLI_MODEL_OPTIONS: Record<CLIModelProvider, AIModelOption[]> = {
  claude: [
    {id: 'sonnet', label: 'Sonnet (latest)', source: 'known'},
    {id: 'sonnet[1m]', label: 'Sonnet (1M context)', source: 'known'},
    {id: 'opus', label: 'Opus (latest)', source: 'known'},
    {id: 'opus[1m]', label: 'Opus (1M context)', source: 'known'},
    {id: 'haiku', label: 'Haiku (latest)', source: 'known'},
  ],
  gemini: [
    {id: 'auto', label: 'Auto (Gemini CLI alias)', source: 'known'},
    {id: 'pro', label: 'Pro (Gemini CLI alias)', source: 'known'},
    {id: 'flash', label: 'Flash (Gemini CLI alias)', source: 'known'},
    {id: 'flash-lite', label: 'Flash Lite (Gemini CLI alias)', source: 'known'},
    {id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview', source: 'known'},
    {id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', source: 'known'},
    {id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', source: 'known'},
    {id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', source: 'known'},
    {id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', source: 'known'},
  ],
  cursor: [
    {id: 'auto', label: 'Auto', source: 'known'},
    {id: 'composer-2', label: 'Composer 2', source: 'known'},
    {id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', source: 'known'},
    {id: 'gpt-5.2', label: 'GPT-5.2', source: 'known'},
    {id: 'claude-4.6-sonnet', label: 'Claude 4.6 Sonnet', source: 'known'},
  ],
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
  if (provider === 'cursor') {
    const available =
      (await isCommandAvailable('agent')) || (await isCommandAvailable('cursor-agent'))
    return {
      id: provider,
      label,
      available,
      reason: available ? undefined : 'Cursor CLI agent or cursor-agent not installed on host',
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

export function getAIProviderModel(provider: CLIModelProvider): string | null {
  return getSetting(`ai_model_${provider}`)
}

export function getAIProviderModels(): Record<CLIModelProvider, string | null> {
  return {
    claude: getAIProviderModel('claude'),
    gemini: getAIProviderModel('gemini'),
    cursor: getAIProviderModel('cursor'),
  }
}

export function getAIModelOptions(): Record<CLIModelProvider, AIModelOption[]> {
  return {
    claude: getAIModelOptionsForProvider('claude'),
    gemini: getAIModelOptionsForProvider('gemini'),
    cursor: getAIModelOptionsForProvider('cursor'),
  }
}

function getAIModelOptionsForProvider(provider: CLIModelProvider): AIModelOption[] {
  const options = [...KNOWN_CLI_MODEL_OPTIONS[provider], ...getConfiguredModelOptions(provider)]
  const saved = getAIProviderModel(provider)
  if (saved && !options.some((option) => option.id === saved)) {
    options.push({id: saved, label: saved, source: 'saved'})
  }
  return options
}

function getConfiguredModelOptions(provider: CLIModelProvider): AIModelOption[] {
  const envName =
    provider === 'claude'
      ? 'AI_MODELS_CLAUDE'
      : provider === 'gemini'
        ? 'AI_MODELS_GEMINI'
        : 'AI_MODELS_CURSOR'
  const value = process.env[envName]
  if (!value) return []
  return value
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)
    .map((model) => ({id: model, label: model, source: 'configured'}))
}

export function setAIProviderModel(provider: CLIModelProvider, model: string | null): void {
  const key = `ai_model_${provider}`
  const value = model?.trim()
  if (!value) {
    clearSetting(key)
    return
  }
  setSetting(key, value)
}
