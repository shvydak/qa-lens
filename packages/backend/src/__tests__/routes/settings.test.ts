import {describe, it, expect, vi, beforeEach} from 'vitest'
import request from 'supertest'
import type Database from 'better-sqlite3'
import {createTestDb, seedProject} from '../helpers/db.js'
import {config} from '../../config.js'

const aiServiceMocks = vi.hoisted(() => ({
  isCommandAvailable: vi.fn(),
}))

let testDb: Database.Database

vi.mock('../../db/index.js', () => ({
  getDb: () => testDb,
}))

vi.mock('../../services/AIService.js', () => aiServiceMocks)

import {createTestApp} from '../helpers/app.js'

const app = createTestApp()

beforeEach(() => {
  testDb = createTestDb()
  vi.clearAllMocks()
  aiServiceMocks.isCommandAvailable.mockResolvedValue(true)
  config.anthropicApiKey = 'test-key'
})

describe('GET /api/settings', () => {
  it('returns null default and a list of detected providers with availability', async () => {
    aiServiceMocks.isCommandAvailable.mockImplementation(async (cmd: string) => cmd === 'claude')
    config.anthropicApiKey = ''

    const res = await request(app).get('/api/settings')

    expect(res.status).toBe(200)
    expect(res.body.data.defaultAiProvider).toBeNull()
    expect(res.body.data.aiProviderModels).toEqual({claude: null, gemini: null})
    expect(res.body.data.aiModelOptions.claude).toEqual(
      expect.arrayContaining([
        expect.objectContaining({id: 'sonnet'}),
        expect.objectContaining({id: 'sonnet[1m]'}),
        expect.objectContaining({id: 'opus'}),
        expect.objectContaining({id: 'opus[1m]'}),
        expect.objectContaining({id: 'haiku'}),
      ])
    )
    expect(res.body.data.aiModelOptions.gemini).toEqual(
      expect.arrayContaining([expect.objectContaining({id: 'gemini-2.5-pro'})])
    )
    const providers = res.body.data.availableProviders
    expect(providers).toHaveLength(3)
    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({id: 'claude', available: true}),
        expect.objectContaining({id: 'gemini', available: false, reason: expect.any(String)}),
        expect.objectContaining({id: 'anthropic', available: false, reason: expect.any(String)}),
      ])
    )
  })

  it('reports the saved default provider', async () => {
    testDb
      .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
      .run('default_ai_provider', 'gemini')

    const res = await request(app).get('/api/settings')

    expect(res.status).toBe(200)
    expect(res.body.data.defaultAiProvider).toBe('gemini')
  })

  it('reports saved CLI provider models', async () => {
    testDb
      .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
      .run('ai_model_claude', 'sonnet')
    testDb
      .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
      .run('ai_model_gemini', 'gemini-2.5-pro')

    const res = await request(app).get('/api/settings')

    expect(res.status).toBe(200)
    expect(res.body.data.aiProviderModels).toEqual({
      claude: 'sonnet',
      gemini: 'gemini-2.5-pro',
    })
  })

  it('includes saved custom models in selectable options', async () => {
    testDb
      .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
      .run('ai_model_claude', 'claude-custom-local')

    const res = await request(app).get('/api/settings')

    expect(res.status).toBe(200)
    expect(res.body.data.aiModelOptions.claude).toEqual(
      expect.arrayContaining([
        expect.objectContaining({id: 'claude-custom-local', source: 'saved'}),
      ])
    )
  })
})

describe('PATCH /api/settings', () => {
  it('saves a valid provider id', async () => {
    const res = await request(app).patch('/api/settings').send({defaultAiProvider: 'claude'})

    expect(res.status).toBe(200)
    expect(res.body.data.defaultAiProvider).toBe('claude')

    const stored = testDb
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get('default_ai_provider') as {value: string} | undefined
    expect(stored?.value).toBe('claude')
  })

  it('saves CLI provider models', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({aiProviderModels: {claude: ' sonnet ', gemini: 'gemini-2.5-pro'}})

    expect(res.status).toBe(200)
    expect(res.body.data.aiProviderModels).toEqual({
      claude: 'sonnet',
      gemini: 'gemini-2.5-pro',
    })

    const rows = testDb
      .prepare("SELECT key, value FROM app_settings WHERE key LIKE 'ai_model_%' ORDER BY key")
      .all() as Array<{key: string; value: string}>
    expect(rows).toEqual([
      {key: 'ai_model_claude', value: 'sonnet'},
      {key: 'ai_model_gemini', value: 'gemini-2.5-pro'},
    ])
  })

  it('clears CLI provider models when null or blank is passed', async () => {
    testDb
      .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
      .run('ai_model_claude', 'sonnet')
    testDb
      .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
      .run('ai_model_gemini', 'gemini-2.5-pro')

    const res = await request(app)
      .patch('/api/settings')
      .send({aiProviderModels: {claude: null, gemini: '  '}})

    expect(res.status).toBe(200)
    expect(res.body.data.aiProviderModels).toEqual({claude: null, gemini: null})
  })

  it('rejects model selection for unsupported providers', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .send({aiProviderModels: {anthropic: 'claude-sonnet-4-5'}})

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('not supported')
  })

  it('rejects unknown providers', async () => {
    const res = await request(app).patch('/api/settings').send({defaultAiProvider: 'gpt'})

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Unknown AI provider')
  })

  it('clears the setting when null is passed', async () => {
    testDb
      .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
      .run('default_ai_provider', 'claude')

    const res = await request(app).patch('/api/settings').send({defaultAiProvider: null})

    expect(res.status).toBe(200)
    expect(res.body.data.defaultAiProvider).toBeNull()
    const remaining = testDb
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get('default_ai_provider')
    expect(remaining).toBeUndefined()
  })

  it('clears the setting when empty string is passed', async () => {
    testDb
      .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
      .run('default_ai_provider', 'claude')

    const res = await request(app).patch('/api/settings').send({defaultAiProvider: ''})

    expect(res.status).toBe(200)
    expect(res.body.data.defaultAiProvider).toBeNull()
  })
})

describe('GET /api/settings/credentials', () => {
  it('returns only global credentials and never exposes the token', async () => {
    const projectId = seedProject(testDb)
    testDb
      .prepare('INSERT INTO github_credentials (id, project_id, name, token) VALUES (?, ?, ?, ?)')
      .run('cred-project', projectId, 'Project token', 'project-secret')
    testDb
      .prepare(
        'INSERT INTO github_credentials (id, project_id, name, token) VALUES (?, NULL, ?, ?)'
      )
      .run('cred-global', 'Global token', 'global-secret')

    const res = await request(app).get('/api/settings/credentials')

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0]).toMatchObject({
      id: 'cred-global',
      projectId: null,
      scope: 'global',
      name: 'Global token',
      hasToken: true,
    })
    expect(res.body.data[0].token).toBeUndefined()
  })
})

describe('POST /api/settings/credentials', () => {
  it('creates a global credential without project scope', async () => {
    const res = await request(app)
      .post('/api/settings/credentials')
      .send({name: 'Acme org', token: 'global-secret'})

    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({
      projectId: null,
      scope: 'global',
      name: 'Acme org',
      hasToken: true,
    })
    expect(res.body.data.token).toBeUndefined()

    const row = testDb
      .prepare('SELECT project_id, token FROM github_credentials WHERE id = ?')
      .get(res.body.data.id) as {project_id: string | null; token: string} | undefined
    expect(row?.project_id).toBeNull()
    expect(row?.token).toBe('global-secret')
  })

  it('rejects duplicate global names', async () => {
    testDb
      .prepare(
        'INSERT INTO github_credentials (id, project_id, name, token) VALUES (?, NULL, ?, ?)'
      )
      .run('cred-global', 'Acme org', 'global-secret')

    const res = await request(app)
      .post('/api/settings/credentials')
      .send({name: 'Acme org', token: 'another'})

    expect(res.status).toBe(409)
    expect(res.body.error).toContain('already exists')
  })

  it('allows the same name in global and project scopes', async () => {
    const projectId = seedProject(testDb)
    testDb
      .prepare('INSERT INTO github_credentials (id, project_id, name, token) VALUES (?, ?, ?, ?)')
      .run('cred-project', projectId, 'Acme org', 'project-secret')

    const res = await request(app)
      .post('/api/settings/credentials')
      .send({name: 'Acme org', token: 'global-secret'})

    expect(res.status).toBe(201)
    expect(res.body.data.scope).toBe('global')
  })

  it('requires name and token', async () => {
    const noName = await request(app).post('/api/settings/credentials').send({token: 'x'})
    expect(noName.status).toBe(400)

    const noToken = await request(app).post('/api/settings/credentials').send({name: 'x'})
    expect(noToken.status).toBe(400)
  })
})

describe('DELETE /api/settings/credentials/:id', () => {
  it('deletes a global credential', async () => {
    testDb
      .prepare(
        'INSERT INTO github_credentials (id, project_id, name, token) VALUES (?, NULL, ?, ?)'
      )
      .run('cred-global', 'Acme org', 'secret')

    const res = await request(app).delete('/api/settings/credentials/cred-global')

    expect(res.status).toBe(200)
    const remaining = testDb
      .prepare('SELECT id FROM github_credentials WHERE id = ?')
      .get('cred-global')
    expect(remaining).toBeUndefined()
  })

  it('does not delete project-scoped credentials through the global endpoint', async () => {
    const projectId = seedProject(testDb)
    testDb
      .prepare('INSERT INTO github_credentials (id, project_id, name, token) VALUES (?, ?, ?, ?)')
      .run('cred-project', projectId, 'Project token', 'secret')

    const res = await request(app).delete('/api/settings/credentials/cred-project')

    expect(res.status).toBe(404)
    const stillThere = testDb
      .prepare('SELECT id FROM github_credentials WHERE id = ?')
      .get('cred-project')
    expect(stillThere).toBeDefined()
  })
})
