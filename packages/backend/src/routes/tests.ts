import {Router} from 'express'
import {writeFile, unlink} from 'node:fs/promises'
import {join} from 'node:path'
import {getDb} from '../db/index.js'
import {testToDto, attachmentToDto} from '../db/mappers.js'
import {ulid} from '../utils/ulid.js'
import {asyncHandler} from './asyncHandler.js'
import {config} from '../config.js'
import type Database from 'better-sqlite3'

export const testsRouter = Router({mergeParams: true})
export const testActionsRouter = Router()

function testWithAttachments(db: Database.Database, testId: string) {
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(testId)
  const attachments = db
    .prepare('SELECT * FROM test_attachments WHERE test_id = ? ORDER BY created_at')
    .all(testId)
  return {...testToDto(test), attachments: attachments.map(attachmentToDto)}
}

const PRIORITIES = new Set(['high', 'medium', 'low'])

function trimToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function trimStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

testsRouter.post('/', (req, res) => {
  const {testSetId} = req.params as {testSetId: string}
  const body = req.body as {
    description?: string
    priority?: string
    area?: string
    title?: string
    userScenario?: string
    preconditions?: unknown
    steps?: unknown
    expectedResult?: string
    risk?: string
    technicalContext?: string
  }

  const description = body.description?.trim()
  if (!description) return res.status(400).json({error: 'description is required'})

  const priority = body.priority ?? 'medium'
  if (!PRIORITIES.has(priority)) return res.status(400).json({error: 'invalid priority'})

  const title = trimToNull(body.title)
  const area = trimToNull(body.area)
  const userScenario = trimToNull(body.userScenario)
  const expectedResult = trimToNull(body.expectedResult)
  const risk = trimToNull(body.risk)
  const technicalContext = trimToNull(body.technicalContext)
  const preconditions = trimStringArray(body.preconditions)
  const steps = trimStringArray(body.steps)

  const db = getDb()
  const testSet = db.prepare('SELECT id FROM test_sets WHERE id = ?').get(testSetId)
  if (!testSet) return res.status(404).json({error: 'Test set not found'})

  const maxOrder =
    (
      db.prepare('SELECT MAX(sort_order) as m FROM tests WHERE test_set_id = ?').get(testSetId) as {
        m: number | null
      }
    ).m ?? -1

  const id = ulid()
  db.prepare(
    `INSERT INTO tests (
      id, test_set_id, description, title, priority, area,
      user_scenario, preconditions, steps, expected_result, risk, technical_context,
      source, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`
  ).run(
    id,
    testSetId,
    description,
    title,
    priority,
    area,
    userScenario,
    preconditions.length > 0 ? JSON.stringify(preconditions) : null,
    steps.length > 0 ? JSON.stringify(steps) : null,
    expectedResult,
    risk,
    technicalContext,
    maxOrder + 1
  )

  return res.status(201).json({data: testWithAttachments(db, id)})
})

testActionsRouter.patch('/:testId', (req, res) => {
  const db = getDb()
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.testId) as
    | Record<string, unknown>
    | undefined
  if (!test) return res.status(404).json({error: 'Test not found'})

  const body = req.body as {
    status?: string
    description?: string
    sortOrder?: number
    note?: string | null
    title?: string | null
    priority?: string
    area?: string | null
    userScenario?: string | null
    preconditions?: unknown
    steps?: unknown
    expectedResult?: string | null
    risk?: string | null
    technicalContext?: string | null
  }

  if (body.priority !== undefined && !PRIORITIES.has(body.priority)) {
    return res.status(400).json({error: 'invalid priority'})
  }

  let description = test.description as string
  if (body.description !== undefined) {
    const trimmed = body.description?.trim() ?? ''
    if (!trimmed) return res.status(400).json({error: 'description cannot be empty'})
    description = trimmed
  }

  const newNote =
    body.note !== undefined ? body.note?.trim() || null : ((test.note as string | null) ?? null)

  const arrayToColumn = (value: unknown): string | null => {
    const arr = trimStringArray(value)
    return arr.length > 0 ? JSON.stringify(arr) : null
  }

  const title = 'title' in body ? trimToNull(body.title) : ((test.title as string | null) ?? null)
  const area = 'area' in body ? trimToNull(body.area) : ((test.area as string | null) ?? null)
  const priority = body.priority ?? (test.priority as string)
  const userScenario =
    'userScenario' in body
      ? trimToNull(body.userScenario)
      : ((test.user_scenario as string | null) ?? null)
  const expectedResult =
    'expectedResult' in body
      ? trimToNull(body.expectedResult)
      : ((test.expected_result as string | null) ?? null)
  const risk = 'risk' in body ? trimToNull(body.risk) : ((test.risk as string | null) ?? null)
  const technicalContext =
    'technicalContext' in body
      ? trimToNull(body.technicalContext)
      : ((test.technical_context as string | null) ?? null)
  const preconditions =
    'preconditions' in body
      ? arrayToColumn(body.preconditions)
      : ((test.preconditions as string | null) ?? null)
  const steps =
    'steps' in body ? arrayToColumn(body.steps) : ((test.steps as string | null) ?? null)

  db.prepare(
    `UPDATE tests SET
       status = ?, description = ?, sort_order = ?, note = ?,
       title = ?, priority = ?, area = ?,
       user_scenario = ?, preconditions = ?, steps = ?,
       expected_result = ?, risk = ?, technical_context = ?
     WHERE id = ?`
  ).run(
    body.status ?? test.status,
    description,
    body.sortOrder ?? test.sort_order,
    newNote,
    title,
    priority,
    area,
    userScenario,
    preconditions,
    steps,
    expectedResult,
    risk,
    technicalContext,
    req.params.testId
  )

  return res.json({data: testWithAttachments(db, req.params.testId)})
})

testActionsRouter.delete(
  '/:testId',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const attachments = db
      .prepare('SELECT filename FROM test_attachments WHERE test_id = ?')
      .all(req.params.testId) as Array<{filename: string}>
    await Promise.allSettled(attachments.map((a) => unlink(join(config.uploadsPath, a.filename))))
    db.prepare('DELETE FROM tests WHERE id = ?').run(req.params.testId)
    res.json({data: {ok: true}})
  })
)

testActionsRouter.post(
  '/:testId/attachments',
  asyncHandler(async (req, res) => {
    const {data} = req.body as {data: string}
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(data)
    if (!match) return res.status(400).json({error: 'Invalid image data'})

    const [, mimeType, base64Data] = match
    const ext = (
      {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/gif': 'gif',
        'image/webp': 'webp',
      } as Record<string, string>
    )[mimeType]
    if (!ext) return res.status(400).json({error: 'Unsupported image type'})

    const db = getDb()
    if (!db.prepare('SELECT id FROM tests WHERE id = ?').get(req.params.testId)) {
      return res.status(404).json({error: 'Test not found'})
    }

    const filename = `${ulid()}.${ext}`
    await writeFile(join(config.uploadsPath, filename), Buffer.from(base64Data, 'base64'))

    db.prepare('INSERT INTO test_attachments (id, test_id, filename) VALUES (?, ?, ?)').run(
      ulid(),
      req.params.testId,
      filename
    )

    return res.json({data: testWithAttachments(db, req.params.testId)})
  })
)

testActionsRouter.delete(
  '/:testId/attachments/:attachmentId',
  asyncHandler(async (req, res) => {
    const db = getDb()
    const attachment = db
      .prepare('SELECT * FROM test_attachments WHERE id = ? AND test_id = ?')
      .get(req.params.attachmentId, req.params.testId) as {filename: string} | undefined
    if (!attachment) return res.status(404).json({error: 'Attachment not found'})

    await unlink(join(config.uploadsPath, attachment.filename)).catch(() => {})
    db.prepare('DELETE FROM test_attachments WHERE id = ?').run(req.params.attachmentId)

    return res.json({data: testWithAttachments(db, req.params.testId)})
  })
)
