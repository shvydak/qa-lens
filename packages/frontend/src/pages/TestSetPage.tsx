import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiFetch } from '../api/client.ts'
import type { TestSet, Test } from '../types/index.ts'
import TestItem from '../components/tests/TestItem.tsx'
import AddTestForm from '../components/tests/AddTestForm.tsx'

const STATUS_STYLES = {
  active: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
  passed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/15 text-red-400 border-red-500/20',
}
const STATUS_LABELS = { active: 'In progress', passed: 'Passed', failed: 'Failed' }

export default function TestSetPage() {
  const { id } = useParams<{ id: string }>()
  const [testSet, setTestSet] = useState<TestSet | null>(null)
  const [tests, setTests] = useState<Test[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    if (!id) return
    apiFetch<TestSet & { tests: Test[] }>('GET', `/api/test-sets/${id}`)
      .then((data) => {
        setTestSet(data)
        setTests(data.tests ?? [])
      })
      .finally(() => setLoading(false))
  }, [id])

  const updateTestStatus = async (test: Test, newStatus: Test['status']) => {
    const updated = await apiFetch<Test>('PATCH', `/api/tests/${test.id}`, { status: newStatus })
    setTests((ts) => ts.map((t) => (t.id === updated.id ? updated : t)))
  }

  const deleteTest = async (testId: string) => {
    await apiFetch('DELETE', `/api/tests/${testId}`)
    setTests((ts) => ts.filter((t) => t.id !== testId))
  }

  const addTest = async (data: { description: string; priority: Test['priority']; area: string }) => {
    const test = await apiFetch<Test>('POST', `/api/test-sets/${id}/tests`, data)
    setTests((ts) => [...ts, test])
  }

  const markPassed = async () => {
    if (!testSet) return
    setMarking(true)
    try {
      const updated = await apiFetch<TestSet>('PATCH', `/api/test-sets/${testSet.id}`, { status: 'passed' })
      setTestSet(updated)
    } finally {
      setMarking(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4 max-w-4xl mx-auto">
        <div className="h-6 w-40 bg-gray-900 rounded animate-pulse" />
        <div className="h-8 w-72 bg-gray-900 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!testSet) {
    return <div className="p-8 text-gray-500">Test set not found</div>
  }

  const totalTests = tests.length
  const doneTests = tests.filter((t) => t.status === 'pass' || t.status === 'skip').length
  const failedTests = tests.filter((t) => t.status === 'fail').length
  const progress = totalTests > 0 ? (doneTests / totalTests) * 100 : 0
  const canMarkPassed = testSet.status === 'active' && failedTests === 0 && doneTests === totalTests && totalTests > 0

  const sortedTests = [...tests].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    const diff = priorityOrder[a.priority] - priorityOrder[b.priority]
    return diff !== 0 ? diff : a.sortOrder - b.sortOrder
  })

  return (
    <div className="pb-24">
      <div className="max-w-4xl mx-auto px-8 pt-8">
        <Link
          to={`/projects/${testSet.projectId}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors mb-6"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to project
        </Link>

        <div className="flex items-start gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className={`px-2.5 py-1 text-xs border rounded-lg ${STATUS_STYLES[testSet.status]}`}>
                {STATUS_LABELS[testSet.status]}
              </span>
              <span className="text-xs text-gray-600">
                {new Date(testSet.createdAt).toLocaleDateString('en-US', {
                  day: 'numeric', month: 'long', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
            <h1 className="text-lg font-mono font-medium text-gray-200 leading-snug">{testSet.name}</h1>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>{doneTests} of {totalTests} completed</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {testSet.aiSummary && (
          <div className="mb-4 p-4 bg-gray-900 border border-gray-800/50 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-indigo-400">
                <path d="M6.5 1L8 5h4L9 7.5l1 4-3.5-2L3 11.5l1-4L1 5h4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">AI Analysis</span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{testSet.aiSummary}</p>
          </div>
        )}

        {testSet.regressions?.length > 0 && (
          <div className="mb-4 p-4 bg-amber-500/5 border border-amber-500/15 rounded-xl">
            <div className="flex items-center gap-2 mb-2.5">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-amber-400">
                <path d="M6.5 1.5L12 11.5H1L6.5 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M6.5 5v3M6.5 9.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Possible Regressions</span>
            </div>
            <ul className="space-y-1">
              {testSet.regressions.map((r, i) => (
                <li key={i} className="text-sm text-amber-300/80 flex items-start gap-2">
                  <span className="text-amber-600 mt-1">·</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {testSet.crossImpacts?.length > 0 && (
          <div className="mb-6 p-4 bg-blue-500/5 border border-blue-500/15 rounded-xl">
            <div className="flex items-center gap-2 mb-2.5">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-blue-400">
                <path d="M1.5 6.5h10M6.5 1.5v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Cross-repo Impact</span>
            </div>
            <ul className="space-y-1">
              {testSet.crossImpacts.map((c, i) => (
                <li key={i} className="text-sm text-blue-300/80 flex items-start gap-2">
                  <span className="text-blue-600 mt-1">·</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Test Cases</h2>
            <div className="flex gap-3 text-xs">
              <span className="text-emerald-500">{tests.filter(t => t.status === 'pass').length} pass</span>
              <span className="text-red-400">{failedTests} fail</span>
              <span className="text-gray-500">{tests.filter(t => t.status === 'not_tested').length} pending</span>
            </div>
          </div>

          <div className="space-y-1.5">
            {sortedTests.map((test) => (
              <TestItem
                key={test.id}
                test={test}
                onStatusChange={(status) => updateTestStatus(test, status)}
                onDelete={() => deleteTest(test.id)}
              />
            ))}
          </div>

          {testSet.status === 'active' && (
            <div className="mt-3">
              <AddTestForm onAdd={addTest} />
            </div>
          )}
        </div>
      </div>

      {testSet.status === 'active' && (
        <div className="fixed bottom-0 left-56 right-0 bg-gray-950/90 backdrop-blur-md border-t border-gray-800/60 px-8 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="text-sm text-gray-500">
              {!canMarkPassed && (
                failedTests > 0
                  ? <span className="text-red-400">{failedTests} failed test{failedTests > 1 ? 's' : ''}</span>
                  : <span>Complete all tests to mark as passed</span>
              )}
            </div>
            <button
              onClick={markPassed}
              disabled={!canMarkPassed || marking}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7l3.5 3.5L12 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {marking ? 'Saving...' : 'Mark as Passed'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
