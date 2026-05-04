import {Router} from 'express'
import {getDb} from '../db/index.js'
import {ulid} from '../utils/ulid.js'
import {
  ALL_AI_PROVIDERS,
  clearSetting,
  getAvailableProviders,
  getDefaultAIProvider,
  setSetting,
} from '../services/SettingsService.js'
import type {AIProvider} from '../config.js'

export const settingsRouter = Router()

settingsRouter.get('/', async (_req, res) => {
  const providers = await getAvailableProviders()
  res.json({
    data: {
      defaultAiProvider: getDefaultAIProvider(),
      availableProviders: providers,
    },
  })
})

settingsRouter.patch('/', (req, res) => {
  const {defaultAiProvider} = req.body as {defaultAiProvider?: string | null}

  if (defaultAiProvider === null || defaultAiProvider === '') {
    clearSetting('default_ai_provider')
  } else if (typeof defaultAiProvider === 'string') {
    if (!ALL_AI_PROVIDERS.includes(defaultAiProvider as AIProvider)) {
      return res.status(400).json({error: `Unknown AI provider: ${defaultAiProvider}`})
    }
    setSetting('default_ai_provider', defaultAiProvider)
  }

  return res.json({data: {defaultAiProvider: getDefaultAIProvider()}})
})

settingsRouter.get('/credentials', (_req, res) => {
  const rows = getDb()
    .prepare(
      `
      SELECT id, project_id, name, token, created_at
      FROM github_credentials
      WHERE project_id IS NULL
      ORDER BY name
    `
    )
    .all()
  res.json({data: rows.map(credentialToDto)})
})

settingsRouter.post('/credentials', (req, res) => {
  const {name, token} = req.body as {name?: string; token?: string}
  if (!name?.trim()) return res.status(400).json({error: 'name is required'})
  if (!token?.trim()) return res.status(400).json({error: 'token is required'})

  const id = ulid()
  try {
    getDb()
      .prepare(
        `
        INSERT INTO github_credentials (id, project_id, name, token)
        VALUES (?, NULL, ?, ?)
      `
      )
      .run(id, name.trim(), token.trim())
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return res.status(409).json({error: 'A global credential with this name already exists'})
    }
    throw err
  }

  const row = getDb().prepare('SELECT * FROM github_credentials WHERE id = ?').get(id)
  return res.status(201).json({data: credentialToDto(row)})
})

settingsRouter.delete('/credentials/:id', (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM github_credentials WHERE id = ? AND project_id IS NULL')
    .run(req.params.id)
  if (result.changes === 0) return res.status(404).json({error: 'Credential not found'})
  return res.json({data: {ok: true}})
})

function credentialToDto(row: unknown) {
  const r = row as Record<string, unknown>
  return {
    id: r.id,
    projectId: r.project_id ?? null,
    scope: r.project_id ? 'project' : 'global',
    name: r.name,
    hasToken: Boolean(r.token),
    createdAt: r.created_at,
  }
}
