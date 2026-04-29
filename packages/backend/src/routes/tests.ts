import { Router } from 'express'
import { getDb } from '../db/index.js'
import { ulid } from '../utils/ulid.js'

export const testsRouter = Router({ mergeParams: true })
export const testActionsRouter = Router()

testsRouter.post('/', (req, res) => {
  const { testSetId } = req.params as { testSetId: string }
  const { description, priority = 'medium', area } = req.body as {
    description?: string
    priority?: string
    area?: string
  }
  if (!description?.trim()) return res.status(400).json({ error: 'description is required' })

  const db = getDb()
  const testSet = db.prepare('SELECT id FROM test_sets WHERE id = ?').get(testSetId)
  if (!testSet) return res.status(404).json({ error: 'Test set not found' })

  const maxOrder = (db
    .prepare('SELECT MAX(sort_order) as m FROM tests WHERE test_set_id = ?')
    .get(testSetId) as { m: number | null }).m ?? -1

  const id = ulid()
  db.prepare(
    'INSERT INTO tests (id, test_set_id, description, priority, area, source, sort_order) VALUES (?, ?, ?, ?, ?, \'manual\', ?)'
  ).run(id, testSetId, description.trim(), priority, area ?? null, maxOrder + 1)

  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(id)
  return res.status(201).json({ data: toDto(test) })
})

testActionsRouter.patch('/:testId', (req, res) => {
  const db = getDb()
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.testId) as
    | Record<string, unknown>
    | undefined
  if (!test) return res.status(404).json({ error: 'Test not found' })

  const { status, description, sortOrder } = req.body as {
    status?: string
    description?: string
    sortOrder?: number
  }

  db.prepare('UPDATE tests SET status = ?, description = ?, sort_order = ? WHERE id = ?').run(
    status ?? test.status,
    description ?? test.description,
    sortOrder ?? test.sort_order,
    req.params.testId
  )

  const updated = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.testId)
  return res.json({ data: toDto(updated) })
})

testActionsRouter.delete('/:testId', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM tests WHERE id = ?').run(req.params.testId)
  res.json({ data: { ok: true } })
})

function toDto(row: unknown) {
  const r = row as Record<string, unknown>
  return {
    id: r.id,
    testSetId: r.test_set_id,
    description: r.description,
    priority: r.priority,
    area: r.area ?? null,
    status: r.status,
    source: r.source,
    sortOrder: r.sort_order,
  }
}
