import {describe, it, expect, vi, beforeEach} from 'vitest'
import request from 'supertest'
import type Database from 'better-sqlite3'
import {createTestDb, seedProject, seedRepo, seedTestSet} from '../helpers/db.js'

let testDb: Database.Database

vi.mock('../../db/index.js', () => ({
  getDb: () => testDb,
}))

import {createTestApp} from '../helpers/app.js'

beforeEach(() => {
  testDb = createTestDb()
})

const app = createTestApp()

describe('PATCH /api/test-sets/:id', () => {
  it('status=passed calls markTestSetPassed — advances repo cursor to commitRange.to', async () => {
    const projectId = seedProject(testDb)
    const repoId = seedRepo(testDb, projectId, {id: 'repo-1', lastAnalyzedCommitHash: null})
    const testSetId = seedTestSet(testDb, projectId, {
      commitRanges: {'repo-1': {from: null, to: 'target-hash'}},
    })

    const res = await request(app).patch(`/api/test-sets/${testSetId}`).send({status: 'passed'})

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('passed')

    // Verify cursor was advanced — only markTestSetPassed does this, not a plain UPDATE
    const repo = testDb
      .prepare('SELECT last_analyzed_commit_hash FROM repositories WHERE id = ?')
      .get(repoId) as {last_analyzed_commit_hash: string}
    expect(repo.last_analyzed_commit_hash).toBe('target-hash')
  })

  it('status=failed does NOT advance repo cursor', async () => {
    const projectId = seedProject(testDb)
    const repoId = seedRepo(testDb, projectId, {id: 'repo-1', lastAnalyzedCommitHash: null})
    const testSetId = seedTestSet(testDb, projectId, {
      commitRanges: {'repo-1': {from: null, to: 'target-hash'}},
    })

    await request(app).patch(`/api/test-sets/${testSetId}`).send({status: 'failed'})

    const repo = testDb
      .prepare('SELECT last_analyzed_commit_hash FROM repositories WHERE id = ?')
      .get(repoId) as {last_analyzed_commit_hash: string | null}
    expect(repo.last_analyzed_commit_hash).toBeNull()
  })

  it('returns 404 for non-existent test set', async () => {
    const res = await request(app).patch('/api/test-sets/nonexistent').send({status: 'passed'})

    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('error')
  })

  it('updates name without changing status', async () => {
    const projectId = seedProject(testDb)
    const testSetId = seedTestSet(testDb, projectId)

    const res = await request(app).patch(`/api/test-sets/${testSetId}`).send({name: 'New Name'})

    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('New Name')
    expect(res.body.data.status).toBe('active')
  })
})

describe('DELETE /api/test-sets/:id', () => {
  it('deletes the test set', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId)
    const testSetId = seedTestSet(testDb, projectId)

    const res = await request(app).delete(`/api/test-sets/${testSetId}`)

    expect(res.status).toBe(200)
    expect(res.body.data.ok).toBe(true)

    const ts = testDb.prepare('SELECT id FROM test_sets WHERE id = ?').get(testSetId)
    expect(ts).toBeUndefined()
  })

  it('?rewind=true recomputes repo cursor from remaining passed test sets', async () => {
    const projectId = seedProject(testDb)
    const repoId = seedRepo(testDb, projectId, {id: 'repo-1', lastAnalyzedCommitHash: 'hash2'})

    seedTestSet(testDb, projectId, {
      id: 'ts-old',
      status: 'passed',
      commitRanges: {'repo-1': {from: null, to: 'hash1'}},
    })
    const newerTsId = seedTestSet(testDb, projectId, {
      id: 'ts-new',
      status: 'passed',
      commitRanges: {'repo-1': {from: 'hash1', to: 'hash2'}},
    })

    const res = await request(app).delete(`/api/test-sets/${newerTsId}?rewind=true`)

    expect(res.status).toBe(200)

    const repo = testDb
      .prepare('SELECT last_analyzed_commit_hash FROM repositories WHERE id = ?')
      .get(repoId) as {last_analyzed_commit_hash: string}
    expect(repo.last_analyzed_commit_hash).toBe('hash1')
  })

  it('returns 404 for non-existent test set', async () => {
    const res = await request(app).delete('/api/test-sets/nonexistent')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/projects/:projectId/test-sets', () => {
  it('returns test sets for project ordered by created_at desc', async () => {
    const projectId = seedProject(testDb)
    seedTestSet(testDb, projectId, {id: 'ts-1'})
    seedTestSet(testDb, projectId, {id: 'ts-2'})

    const res = await request(app).get(`/api/projects/${projectId}/test-sets`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.data[0]).toMatchObject({projectId, status: 'active'})
  })

  it('returns empty array when no test sets', async () => {
    const projectId = seedProject(testDb)
    const res = await request(app).get(`/api/projects/${projectId}/test-sets`)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })
})

describe('GET /api/test-sets/:id', () => {
  it('returns analysis runs and test analysis metadata', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1'})
    const testSetId = seedTestSet(testDb, projectId, {
      id: 'ts-1',
      commitRanges: {'repo-1-branch': {from: null, to: 'head-hash'}},
    })
    testDb
      .prepare(
        `
        INSERT INTO analysis_runs (id, test_set_id, label, commit_ranges, ai_summary)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(
        'run-1',
        testSetId,
        'Initial analysis 2026-05-03',
        JSON.stringify({'repo-1-branch': {from: null, to: 'head-hash'}}),
        'Initial summary'
      )
    testDb
      .prepare(
        `
        INSERT INTO tests (
          id,
          test_set_id,
          description,
          title,
          priority,
          analysis_run_id,
          repository_branch_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run('test-1', testSetId, 'Verify login', 'Verify login', 'high', 'run-1', 'repo-1-branch')

    const res = await request(app).get(`/api/test-sets/${testSetId}`)

    expect(res.status).toBe(200)
    expect(res.body.data.analysisRuns).toEqual([
      expect.objectContaining({
        id: 'run-1',
        label: 'Initial analysis 2026-05-03',
        aiSummary: 'Initial summary',
      }),
    ])
    expect(res.body.data.tests).toEqual([
      expect.objectContaining({
        id: 'test-1',
        analysisRunId: 'run-1',
        repositoryBranchId: 'repo-1-branch',
      }),
    ])
  })
})
