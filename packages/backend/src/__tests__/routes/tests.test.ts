import {describe, it, expect, vi, beforeEach} from 'vitest'
import request from 'supertest'
import type Database from 'better-sqlite3'
import {createTestDb, seedProject, seedTestSet} from '../helpers/db.js'
import {config} from '../../config.js'

const {mockWriteFile, mockUnlink} = vi.hoisted(() => ({
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockUnlink: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('node:fs/promises', () => ({
  writeFile: mockWriteFile,
  unlink: mockUnlink,
}))

let testDb: Database.Database

vi.mock('../../db/index.js', () => ({getDb: () => testDb}))

import {createTestApp} from '../helpers/app.js'

const app = createTestApp()

// Minimal 1×1 PNG — valid base64 data URL for all upload tests
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function seedTest(db: Database.Database, testSetId: string, id = 'test-1') {
  db.prepare(
    `INSERT INTO tests (id, test_set_id, description, priority, status, source, sort_order)
     VALUES (?, ?, ?, 'medium', 'not_tested', 'manual', 0)`
  ).run(id, testSetId, 'Verify login')
  return id
}

function seedAttachment(
  db: Database.Database,
  testId: string,
  id = 'att-1',
  filename = 'att-1.png'
) {
  db.prepare('INSERT INTO test_attachments (id, test_id, filename) VALUES (?, ?, ?)').run(
    id,
    testId,
    filename
  )
  return id
}

beforeEach(() => {
  testDb = createTestDb()
  config.uploadsPath = '/tmp/test-uploads'
  mockWriteFile.mockClear()
  mockUnlink.mockClear()
})

describe('PATCH /api/tests/:testId', () => {
  it('saves note and returns test with empty attachments array', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)
    const testId = seedTest(testDb, tsId)

    const res = await request(app).patch(`/api/tests/${testId}`).send({note: 'Found a bug here'})

    expect(res.status).toBe(200)
    expect(res.body.data.note).toBe('Found a bug here')
    expect(res.body.data.attachments).toEqual([])
  })

  it('trims note whitespace and stores null for blank input', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)
    const testId = seedTest(testDb, tsId)

    const res = await request(app).patch(`/api/tests/${testId}`).send({note: '   '})

    expect(res.status).toBe(200)
    expect(res.body.data.note).toBeNull()
  })

  it('returns 404 for non-existent test', async () => {
    const res = await request(app).patch('/api/tests/ghost').send({status: 'pass'})
    expect(res.status).toBe(404)
  })

  it('updates structured fields and preserves untouched ones', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)
    const testId = seedTest(testDb, tsId)

    testDb
      .prepare(
        `UPDATE tests SET title = ?, area = ?, user_scenario = ?, preconditions = ?, steps = ?, expected_result = ?, risk = ?, technical_context = ? WHERE id = ?`
      )
      .run(
        'Original title',
        'auth',
        'Original scenario',
        JSON.stringify(['p1']),
        JSON.stringify(['s1', 's2']),
        'orig expected',
        'orig risk',
        'orig tech',
        testId
      )

    const res = await request(app)
      .patch(`/api/tests/${testId}`)
      .send({
        title: 'Updated title',
        priority: 'high',
        preconditions: ['new pre'],
      })

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      title: 'Updated title',
      priority: 'high',
      preconditions: ['new pre'],
      area: 'auth',
      userScenario: 'Original scenario',
      steps: ['s1', 's2'],
      expectedResult: 'orig expected',
      risk: 'orig risk',
      technicalContext: 'orig tech',
    })
  })

  it('clears nullable string fields when explicitly set to empty', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)
    const testId = seedTest(testDb, tsId)
    testDb.prepare('UPDATE tests SET user_scenario = ? WHERE id = ?').run('to be cleared', testId)

    const res = await request(app).patch(`/api/tests/${testId}`).send({userScenario: '   '})

    expect(res.status).toBe(200)
    expect(res.body.data.userScenario).toBeNull()
  })

  it('rejects invalid priority on PATCH', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)
    const testId = seedTest(testDb, tsId)

    const res = await request(app).patch(`/api/tests/${testId}`).send({priority: 'urgent'})

    expect(res.status).toBe(400)
  })

  it('rejects empty description on PATCH', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)
    const testId = seedTest(testDb, tsId)

    const res = await request(app).patch(`/api/tests/${testId}`).send({description: '  '})

    expect(res.status).toBe(400)
  })
})

describe('POST /api/tests/:testId/attachments', () => {
  it('returns 400 for invalid data URL', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)
    const testId = seedTest(testDb, tsId)

    const res = await request(app)
      .post(`/api/tests/${testId}/attachments`)
      .send({data: 'not-a-data-url'})

    expect(res.status).toBe(400)
  })

  it('returns 400 for unsupported image type (svg)', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)
    const testId = seedTest(testDb, tsId)

    const res = await request(app)
      .post(`/api/tests/${testId}/attachments`)
      .send({data: 'data:image/svg+xml;base64,PHN2Zyc+PC9zdmc+'})

    expect(res.status).toBe(400)
  })

  it('returns 404 for non-existent test', async () => {
    const res = await request(app).post('/api/tests/ghost/attachments').send({data: TINY_PNG})

    expect(res.status).toBe(404)
  })

  it('writes file and returns test with the new attachment', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)
    const testId = seedTest(testDb, tsId)

    const res = await request(app).post(`/api/tests/${testId}/attachments`).send({data: TINY_PNG})

    expect(res.status).toBe(200)
    expect(mockWriteFile).toHaveBeenCalledOnce()
    const [filePath] = mockWriteFile.mock.calls[0] as [string]
    expect(filePath).toMatch(/^\/tmp\/test-uploads\/[A-Z0-9]+\.png$/)
    expect(res.body.data.attachments).toHaveLength(1)
    expect(res.body.data.attachments[0]).toMatchObject({
      testId,
      filename: expect.stringMatching(/\.png$/),
    })
  })
})

describe('DELETE /api/tests/:testId/attachments/:attachmentId', () => {
  it('returns 404 when attachment belongs to a different test', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)
    const testA = seedTest(testDb, tsId, 'test-a')
    const testB = seedTest(testDb, tsId, 'test-b')
    const attId = seedAttachment(testDb, testB)

    const res = await request(app).delete(`/api/tests/${testA}/attachments/${attId}`)

    expect(res.status).toBe(404)
  })

  it('deletes attachment, calls unlink, and returns updated test', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)
    const testId = seedTest(testDb, tsId)
    const attId = seedAttachment(testDb, testId, 'att-1', 'screen.png')

    const res = await request(app).delete(`/api/tests/${testId}/attachments/${attId}`)

    expect(res.status).toBe(200)
    expect(mockUnlink).toHaveBeenCalledWith('/tmp/test-uploads/screen.png')
    expect(res.body.data.attachments).toEqual([])
  })
})

describe('POST /api/test-sets/:testSetId/tests', () => {
  it('creates a manual test with null title so description is not duplicated in UI', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)

    const res = await request(app)
      .post(`/api/test-sets/${tsId}/tests`)
      .send({description: 'Check login flow', priority: 'high', area: 'Auth'})

    expect(res.status).toBe(201)
    expect(res.body.data.description).toBe('Check login flow')
    expect(res.body.data.title).toBeNull()
    expect(res.body.data.priority).toBe('high')
    expect(res.body.data.area).toBe('Auth')
    expect(res.body.data.source).toBe('manual')
  })

  it('returns 400 when description is missing', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)

    const res = await request(app).post(`/api/test-sets/${tsId}/tests`).send({priority: 'low'})

    expect(res.status).toBe(400)
  })

  it('returns 404 for non-existent test set', async () => {
    const res = await request(app).post('/api/test-sets/ghost/tests').send({description: 'Test'})

    expect(res.status).toBe(404)
  })

  it('creates a manual test with full structured fields', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)

    const res = await request(app)
      .post(`/api/test-sets/${tsId}/tests`)
      .send({
        description: 'Verify password reset flow',
        priority: 'high',
        area: 'Auth',
        title: 'Password reset',
        userScenario: 'User clicks "Forgot password" and resets via email link.',
        preconditions: ['User has an account', '  '],
        steps: ['Open login page', 'Click forgot password', 'Submit email'],
        expectedResult: 'Reset email is sent within 30s',
        risk: 'Email may go to spam',
        technicalContext: 'Uses SendGrid template ID 42',
      })

    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({
      description: 'Verify password reset flow',
      title: 'Password reset',
      priority: 'high',
      area: 'Auth',
      userScenario: 'User clicks "Forgot password" and resets via email link.',
      preconditions: ['User has an account'],
      steps: ['Open login page', 'Click forgot password', 'Submit email'],
      expectedResult: 'Reset email is sent within 30s',
      risk: 'Email may go to spam',
      technicalContext: 'Uses SendGrid template ID 42',
      source: 'manual',
    })
  })

  it('ignores non-string entries in preconditions/steps and stores empty arrays as null', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)

    const res = await request(app)
      .post(`/api/test-sets/${tsId}/tests`)
      .send({
        description: 'Plain test',
        preconditions: [],
        steps: [123, null, '   '],
      })

    expect(res.status).toBe(201)
    expect(res.body.data.preconditions).toEqual([])
    expect(res.body.data.steps).toEqual([])
  })

  it('rejects invalid priority', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)

    const res = await request(app)
      .post(`/api/test-sets/${tsId}/tests`)
      .send({description: 'x', priority: 'urgent'})

    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/tests/:testId', () => {
  it('deletes test and calls unlink for each attachment file', async () => {
    const projectId = seedProject(testDb)
    const tsId = seedTestSet(testDb, projectId)
    const testId = seedTest(testDb, tsId)
    seedAttachment(testDb, testId, 'att-1', 'file1.png')
    seedAttachment(testDb, testId, 'att-2', 'file2.png')

    const res = await request(app).delete(`/api/tests/${testId}`)

    expect(res.status).toBe(200)
    expect(res.body.data.ok).toBe(true)
    expect(mockUnlink).toHaveBeenCalledTimes(2)
    const unlinked = mockUnlink.mock.calls.map((c) => c[0] as string)
    expect(unlinked).toEqual(
      expect.arrayContaining(['/tmp/test-uploads/file1.png', '/tmp/test-uploads/file2.png'])
    )
    expect(testDb.prepare('SELECT id FROM tests WHERE id = ?').get(testId)).toBeUndefined()
  })
})
