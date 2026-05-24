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
