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

testsRouter.post('/', (req, res) => {
  const {testSetId} = req.params as {testSetId: string}
  const {
    description,
    priority = 'medium',
    area,
  } = req.body as {
    description?: string
    priority?: string
    area?: string
  }
  if (!description?.trim()) return res.status(400).json({error: 'description is required'})

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
    "INSERT INTO tests (id, test_set_id, description, title, priority, area, source, sort_order) VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)"
  ).run(id, testSetId, description.trim(), description.trim(), priority, area ?? null, maxOrder + 1)

  return res.status(201).json({data: testWithAttachments(db, id)})
})

testActionsRouter.patch('/:testId', (req, res) => {
  const db = getDb()
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.testId) as
    | Record<string, unknown>
    | undefined
  if (!test) return res.status(404).json({error: 'Test not found'})

  const {status, description, sortOrder, note} = req.body as {
    status?: string
    description?: string
    sortOrder?: number
    note?: string | null
  }

  const newNote = note !== undefined ? note?.trim() || null : ((test.note as string | null) ?? null)

  db.prepare(
    'UPDATE tests SET status = ?, description = ?, sort_order = ?, note = ? WHERE id = ?'
  ).run(
    status ?? test.status,
    description ?? test.description,
    sortOrder ?? test.sort_order,
    newNote,
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
