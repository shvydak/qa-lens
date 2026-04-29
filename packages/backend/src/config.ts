import {join} from 'path'
import {fileURLToPath} from 'url'
import {dirname} from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const config = {
  port: Number(process.env.PORT) || 3001,
  dbPath: process.env.DB_PATH || join(__dirname, '../../qa-lens.db'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  aiProviders: (process.env.AI_PROVIDERS || 'claude,gemini,anthropic').split(',') as AIProvider[],
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  gitFetchIntervalMs: 60_000,
  maxDiffBytes: 80_000,
}

export type AIProvider = 'claude' | 'gemini' | 'anthropic'
