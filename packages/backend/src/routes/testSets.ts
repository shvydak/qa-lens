import {Router} from 'express'
import {getDb} from '../db/index.js'
import {deleteTestSet, markTestSetPassed} from '../services/AnalysisService.js'

export const testSetsRouter = Router({mergeParams: true})
export const testSetActionsRouter = Router({mergeParams: true})

testSetsRouter.get('/', (req, res) => {
  const {projectId} = req.params as {projectId: string}
  const db = getDb()
  const rows = db
    .prepare(
      `
      SELECT
        ts.*,
        ac.branch_signature,
        COUNT(ar.id) AS analysis_run_count,
        MAX(ar.created_at) AS latest_analysis_run_at,
        (SELECT COUNT(*) FROM tests t WHERE t.test_set_id = ts.id) AS checklist_total,
        (SELECT COUNT(*) FROM tests t WHERE t.test_set_id = ts.id AND t.status = 'pass') AS checklist_pass,
        (SELECT COUNT(*) FROM tests t WHERE t.test_set_id = ts.id AND t.status = 'fail') AS checklist_fail,
        (SELECT COUNT(*) FROM tests t WHERE t.test_set_id = ts.id AND t.status = 'skip') AS checklist_skip,
        (SELECT COUNT(*) FROM tests t WHERE t.test_set_id = ts.id AND t.status = 'not_tested') AS checklist_not_tested
      FROM test_sets ts
      LEFT JOIN analysis_contexts ac ON ac.id = ts.analysis_context_id
      LEFT JOIN analysis_runs ar ON ar.test_set_id = ts.id
      WHERE ts.project_id = ?
      GROUP BY ts.id
      ORDER BY COALESCE(MAX(ar.created_at), ts.created_at) DESC
    `
    )
    .all(projectId)
  res.json({data: rows.map((row) => toDto(row))})
})

testSetActionsRouter.get('/:testSetId', (req, res) => {
  const db = getDb()
  const testSet = db
    .prepare(
      `
      SELECT ts.*, ac.branch_signature
      FROM test_sets ts
      LEFT JOIN analysis_contexts ac ON ac.id = ts.analysis_context_id
      WHERE ts.id = ?
    `
    )
    .get(req.params.testSetId)
  if (!testSet) return res.status(404).json({error: 'Test set not found'})

  const tests = db
    .prepare('SELECT * FROM tests WHERE test_set_id = ? ORDER BY sort_order, rowid')
    .all(req.params.testSetId)

  const analysisRuns = db
    .prepare('SELECT * FROM analysis_runs WHERE test_set_id = ? ORDER BY created_at, rowid')
    .all(req.params.testSetId)

  const testsDto = tests.map(testToDto)
  const checklistCounts = tallyChecklistFromTests(testsDto)
  return res.json({
    data: {
      ...toDto(testSet, {checklistCounts}),
      tests: testsDto,
      analysisRuns: analysisRuns.map(runToDto),
    },
  })
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
  return res.json({
    data: toDto(updated, {checklistCounts: fetchChecklistCounts(db, req.params.testSetId)}),
  })
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

function toDto(
  row: unknown,
  opts?: {
    checklistCounts?: ChecklistCounts
  }
) {
  const r = row as Record<string, unknown>
  const commitRanges =
    typeof r.commit_ranges === 'string' ? JSON.parse(r.commit_ranges) : r.commit_ranges
  return {
    id: r.id,
    projectId: r.project_id,
    analysisContextId: r.analysis_context_id ?? null,
    branchSignature: r.branch_signature ?? null,
    name: r.name,
    status: r.status,
    commitRanges,
    commitTargets: getCommitTargets(
      commitRanges as Record<string, {from: string | null; to: string}>
    ),
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
    analysisRunCount: Number(r.analysis_run_count ?? 0),
    latestAnalysisRunAt: r.latest_analysis_run_at ?? null,
    checklistCounts: opts?.checklistCounts ?? checklistCountsFromRow(r),
  }
}

type ChecklistCounts = {total: number; pass: number; fail: number; skip: number; notTested: number}

function checklistCountsFromRow(r: Record<string, unknown>): ChecklistCounts {
  if (r.checklist_total !== undefined && r.checklist_total !== null) {
    return {
      total: Number(r.checklist_total),
      pass: Number(r.checklist_pass ?? 0),
      fail: Number(r.checklist_fail ?? 0),
      skip: Number(r.checklist_skip ?? 0),
      notTested: Number(r.checklist_not_tested ?? 0),
    }
  }
  return fetchChecklistCounts(getDb(), r.id as string)
}

function fetchChecklistCounts(db: ReturnType<typeof getDb>, testSetId: string): ChecklistCounts {
  const row = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) AS pass,
        SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) AS fail,
        SUM(CASE WHEN status = 'skip' THEN 1 ELSE 0 END) AS skip,
        SUM(CASE WHEN status = 'not_tested' THEN 1 ELSE 0 END) AS not_tested
      FROM tests
      WHERE test_set_id = ?
    `
    )
    .get(testSetId) as {
    total: number
    pass: number | null
    fail: number | null
    skip: number | null
    not_tested: number | null
  }
  return {
    total: Number(row?.total ?? 0),
    pass: Number(row?.pass ?? 0),
    fail: Number(row?.fail ?? 0),
    skip: Number(row?.skip ?? 0),
    notTested: Number(row?.not_tested ?? 0),
  }
}

function tallyChecklistFromTests(tests: Array<{status: unknown}>) {
  let pass = 0
  let fail = 0
  let skip = 0
  let notTested = 0
  for (const t of tests) {
    const s = t.status as string
    if (s === 'pass') pass += 1
    else if (s === 'fail') fail += 1
    else if (s === 'skip') skip += 1
    else notTested += 1
  }
  return {total: tests.length, pass, fail, skip, notTested}
}

function getCommitTargets(commitRanges: Record<string, {from: string | null; to: string}>) {
  const db = getDb()
  return Object.entries(commitRanges).map(([targetId, range]) => {
    const branch = db
      .prepare(
        `
        SELECT
          rb.id,
          rb.repository_id,
          rb.name,
          r.local_path
        FROM repository_branches rb
        JOIN repositories r ON r.id = rb.repository_id
        WHERE rb.id = ?
      `
      )
      .get(targetId) as
      | {id: string; repository_id: string; name: string; local_path: string}
      | undefined

    if (branch) {
      return {
        id: branch.id,
        repositoryId: branch.repository_id,
        repositoryPath: branch.local_path,
        branchName: branch.name,
        from: range.from,
        to: range.to,
      }
    }

    const repo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(targetId) as
      | {id: string; local_path: string; branch: string}
      | undefined

    return {
      id: targetId,
      repositoryId: repo?.id ?? targetId,
      repositoryPath: repo?.local_path ?? targetId,
      branchName: repo?.branch ?? 'unknown',
      from: range.from,
      to: range.to,
    }
  })
}

function testToDto(row: unknown) {
  const r = row as Record<string, unknown>
  return {
    id: r.id,
    testSetId: r.test_set_id,
    description: r.description,
    title: r.title ?? null,
    priority: r.priority,
    area: r.area ?? null,
    userScenario: r.user_scenario ?? null,
    preconditions: parseStringArray(r.preconditions),
    steps: parseStringArray(r.steps),
    expectedResult: r.expected_result ?? null,
    risk: r.risk ?? null,
    technicalContext: r.technical_context ?? null,
    analysisRunId: r.analysis_run_id ?? null,
    repositoryBranchId: r.repository_branch_id ?? null,
    status: r.status,
    source: r.source,
    sortOrder: r.sort_order,
  }
}

function runToDto(row: unknown) {
  const r = row as Record<string, unknown>
  return {
    id: r.id,
    testSetId: r.test_set_id,
    label: r.label,
    commitRanges:
      typeof r.commit_ranges === 'string' ? JSON.parse(r.commit_ranges) : r.commit_ranges,
    aiSummary: r.ai_summary ?? null,
    createdAt: r.created_at,
  }
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}
