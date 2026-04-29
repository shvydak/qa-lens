import {Router} from 'express'
import {getDb} from '../db/index.js'
import {deleteTestSet, markTestSetPassed} from '../services/AnalysisService.js'

export const testSetsRouter = Router({mergeParams: true})
export const testSetActionsRouter = Router({mergeParams: true})

testSetsRouter.get('/', (req, res) => {
  const {projectId} = req.params as {projectId: string}
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM test_sets WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId)
  res.json({data: rows.map(toDto)})
})

testSetActionsRouter.get('/:testSetId', (req, res) => {
  const db = getDb()
  const testSet = db.prepare('SELECT * FROM test_sets WHERE id = ?').get(req.params.testSetId)
  if (!testSet) return res.status(404).json({error: 'Test set not found'})

  const tests = db
    .prepare('SELECT * FROM tests WHERE test_set_id = ? ORDER BY sort_order, rowid')
    .all(req.params.testSetId)

  return res.json({data: {...toDto(testSet), tests: tests.map(testToDto)}})
})

testSetActionsRouter.patch('/:testSetId', (req, res) => {
  const db = getDb()
  const testSet = db.prepare('SELECT * FROM test_sets WHERE id = ?').get(req.params.testSetId) as
    | Record<string, unknown>
    | undefined
  if (!testSet) return res.status(404).json({error: 'Test set not found'})

  const {status, name} = req.body as {status?: string; name?: string}

  if (status === 'passed') {
    try {
      markTestSetPassed(req.params.testSetId)
    } catch (err) {
      return res
        .status(500)
        .json({error: err instanceof Error ? err.message : 'Failed to mark as passed'})
    }
  } else {
    db.prepare('UPDATE test_sets SET status = ?, name = ? WHERE id = ?').run(
      status ?? testSet.status,
      name ?? testSet.name,
      req.params.testSetId
    )
  }

  const updated = db.prepare('SELECT * FROM test_sets WHERE id = ?').get(req.params.testSetId)
  return res.json({data: toDto(updated)})
})

testSetActionsRouter.delete('/:testSetId', (req, res) => {
  try {
    deleteTestSet(req.params.testSetId, {rewind: req.query.rewind === 'true'})
    return res.json({data: {ok: true}})
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete test set'
    return res.status(message === 'Test set not found' ? 404 : 500).json({error: message})
  }
})

function toDto(row: unknown) {
  const r = row as Record<string, unknown>
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    status: r.status,
    commitRanges:
      typeof r.commit_ranges === 'string' ? JSON.parse(r.commit_ranges) : r.commit_ranges,
    aiSummary: r.ai_summary ?? null,
    regressions:
      typeof r.regressions === 'string'
        ? JSON.parse(r.regressions as string)
        : (r.regressions ?? []),
    crossImpacts:
      typeof r.cross_impacts === 'string'
        ? JSON.parse(r.cross_impacts as string)
        : (r.cross_impacts ?? []),
    createdAt: r.created_at,
    completedAt: r.completed_at ?? null,
  }
}

function testToDto(row: unknown) {
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
