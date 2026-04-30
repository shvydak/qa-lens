import {describe, it, expect, vi, beforeEach} from 'vitest'
import request from 'supertest'
import type Database from 'better-sqlite3'
import {createTestDb, seedProject, seedRepo, seedTestSet} from '../helpers/db.js'

const gitMocks = vi.hoisted(() => ({
  getCommitsSince: vi.fn(),
  validateRepo: vi.fn(),
  fetchOrigin: vi.fn(),
}))

let testDb: Database.Database

vi.mock('../../db/index.js', () => ({
  getDb: () => testDb,
}))

vi.mock('../../services/GitService.js', () => gitMocks)

import {createTestApp} from '../helpers/app.js'

beforeEach(() => {
  testDb = createTestDb()
  vi.clearAllMocks()
})

const app = createTestApp()

describe('GET /api/projects/:projectId/repos', () => {
  it('counts commits from the active test set cursor when one exists', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1', lastAnalyzedCommitHash: 'baseline-hash'})
    seedTestSet(testDb, projectId, {
      commitRanges: {'repo-1': {from: 'baseline-hash', to: 'active-head'}},
    })
    gitMocks.getCommitsSince.mockResolvedValue([{hash: 'new-1'}, {hash: 'new-2'}])

    const res = await request(app).get(`/api/projects/${projectId}/repos`)

    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({
      id: 'repo-1',
      unanalyzedCount: 2,
      analysisCursor: 'active',
    })
    expect(gitMocks.getCommitsSince).toHaveBeenCalledWith('/fake/path', 'main', 'active-head')
  })

  it('falls back to the last passed analysis cursor when there is no active test set', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1', lastAnalyzedCommitHash: 'baseline-hash'})
    gitMocks.getCommitsSince.mockResolvedValue([{hash: 'new-1'}])

    const res = await request(app).get(`/api/projects/${projectId}/repos`)

    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({
      unanalyzedCount: 1,
      analysisCursor: 'baseline',
    })
    expect(gitMocks.getCommitsSince).toHaveBeenCalledWith('/fake/path', 'main', 'baseline-hash')
  })

  it('marks repositories without any cursor as needing an initial analysis', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1', lastAnalyzedCommitHash: null})
    gitMocks.getCommitsSince.mockResolvedValue([{hash: 'latest'}])

    const res = await request(app).get(`/api/projects/${projectId}/repos`)

    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({
      unanalyzedCount: 1,
      analysisCursor: 'none',
    })
    expect(gitMocks.getCommitsSince).toHaveBeenCalledWith('/fake/path', 'main', null)
  })
})
