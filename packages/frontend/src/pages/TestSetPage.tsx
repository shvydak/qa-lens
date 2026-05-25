import {useState, useEffect, useRef} from 'react'
import {useParams, Link, useNavigate} from 'react-router-dom'
import {apiFetch} from '../api/client.ts'
import type {TestSet, Test, Project} from '../types/index.ts'
import {useActiveProject} from '../contexts/ActiveProjectContext.tsx'
import TestItem, {getAreaBadgeStyle} from '../components/tests/TestItem.tsx'
import AddTestForm from '../components/tests/AddTestForm.tsx'
import TestSetInsights from '../components/testSets/TestSetInsights.tsx'
import {
  groupTestsByArea,
  sortTestsByPriority,
  STATUS_LABELS,
  STATUS_STYLES,
} from './testSet/helpers.ts'

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

type ViewMode = 'priority' | 'update' | 'area'

export default function TestSetPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const {setActiveProjectId, invalidateTestSets} = useActiveProject()
  const [testSet, setTestSet] = useState<TestSet | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [tests, setTests] = useState<Test[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('priority')
  const [hiddenStatuses, setHiddenStatuses] = useState<Test['status'][]>([])
  const [areaFilterOpen, setAreaFilterOpen] = useState(false)
  const [hiddenAreaKeys, setHiddenAreaKeys] = useState<string[]>([])
  const [draftHiddenAreaKeys, setDraftHiddenAreaKeys] = useState<string[]>([])
  const areaFilterRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!id) return
    apiFetch<TestSet & {tests: Test[]}>('GET', `/api/test-sets/${id}`)
      .then((data) => {
        setTestSet(data)
        setTests(data.tests ?? [])
        setActiveProjectId(data.projectId)
        apiFetch<Project>('GET', `/api/projects/${data.projectId}`)
          .then(setProject)
          .catch(() => {})
      })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!areaFilterOpen) return

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        areaFilterRef.current &&
        !areaFilterRef.current.contains(event.target)
      ) {
        setHiddenAreaKeys(draftHiddenAreaKeys)
        setAreaFilterOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHiddenAreaKeys(draftHiddenAreaKeys)
        setAreaFilterOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [areaFilterOpen, draftHiddenAreaKeys])

  const updateTestStatus = async (test: Test, newStatus: Test['status']) => {
    const updated = await apiFetch<Test>('PATCH', `/api/tests/${test.id}`, {status: newStatus})
    setTests((ts) => ts.map((t) => (t.id === updated.id ? updated : t)))
    invalidateTestSets()
  }

  const updateTestNote = async (testId: string, note: string | null) => {
    const updated = await apiFetch<Test>('PATCH', `/api/tests/${testId}`, {note})
    setTests((ts) => ts.map((t) => (t.id === updated.id ? updated : t)))
  }

  const uploadTestAttachment = async (testId: string, file: File) => {
    const data = await readFileAsDataUrl(file)
    const updated = await apiFetch<Test>('POST', `/api/tests/${testId}/attachments`, {data})
    setTests((ts) => ts.map((t) => (t.id === updated.id ? updated : t)))
  }

  const deleteTestAttachment = async (testId: string, attachmentId: string) => {
    const updated = await apiFetch<Test>(
      'DELETE',
      `/api/tests/${testId}/attachments/${attachmentId}`
    )
    setTests((ts) => ts.map((t) => (t.id === updated.id ? updated : t)))
  }

  const deleteTest = async (testId: string) => {
    await apiFetch('DELETE', `/api/tests/${testId}`)
    setTests((ts) => ts.filter((t) => t.id !== testId))
  }

  const addTest = async (data: {description: string; priority: Test['priority']; area: string}) => {
    const test = await apiFetch<Test>('POST', `/api/test-sets/${id}/tests`, data)
    setTests((ts) => [...ts, test])
  }

  const closeReview = async (status: 'reviewed' | 'not_required') => {
    if (!testSet) return
    setMarking(true)
    try {
      const updated = await apiFetch<TestSet>('PATCH', `/api/test-sets/${testSet.id}`, {
        status,
      })
      setTestSet(updated)
      setTests((current) =>
        current.map((test) =>
          test.status === 'pass' || test.status === 'fail' ? test : {...test, status: 'skip'}
        )
      )
      invalidateTestSets()
    } finally {
      setMarking(false)
    }
  }

  const deleteTestSet = async (rewind: boolean) => {
    if (!testSet) return

    const message = rewind
      ? 'Delete this test set and rewind the analysis point to the latest remaining closed review?'
      : 'Delete this test set? This will not change the analysis point.'
    if (!window.confirm(message)) return

    setDeleting(true)
    try {
      await apiFetch('DELETE', `/api/test-sets/${testSet.id}${rewind ? '?rewind=true' : ''}`)
      navigate(`/projects/${testSet.projectId}`)
    } finally {
      setDeleting(false)
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
  const isEmptyReview = testSet.isEmptyReview && totalTests === 0
  const isClosedReview = testSet.status !== 'active'
  const compactProgressLabel = isEmptyReview
    ? 'Empty review'
    : totalTests > 0
      ? `${doneTests}/${totalTests} done`
      : 'No tests'

  const toggleStatus = (status: Test['status']) => {
    setHiddenStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    )
  }

  const visibleTests =
    hiddenStatuses.length === 0 ? tests : tests.filter((t) => !hiddenStatuses.includes(t.status))

  const passCount = tests.filter((t) => t.status === 'pass').length
  const skipCount = tests.filter((t) => t.status === 'skip').length

  const sortedTests = sortTestsByPriority(visibleTests)
  const runById = new Map((testSet.analysisRuns ?? []).map((run) => [run.id, run]))
  const allAreaGroups = groupTestsByArea(tests)
  const areaGroups = allAreaGroups
    .filter((group) => !hiddenAreaKeys.includes(group.key))
    .map((group) => ({
      ...group,
      tests: sortTestsByPriority(group.tests.filter((t) => !hiddenStatuses.includes(t.status))),
    }))
    .filter((group) => group.tests.length > 0)
  const hiddenAreaCount = hiddenAreaKeys.filter((key) =>
    allAreaGroups.some((group) => group.key === key)
  ).length
  const draftHiddenAreaCount = draftHiddenAreaKeys.filter((key) =>
    allAreaGroups.some((group) => group.key === key)
  ).length
  const displayHiddenAreaCount =
    areaFilterOpen && viewMode === 'area' ? draftHiddenAreaCount : hiddenAreaCount
  const visibleAreaCount = allAreaGroups.length - displayHiddenAreaCount
  const toggleAreaFilter = (key: string) => {
    setDraftHiddenAreaKeys((current) =>
      current.includes(key) ? current.filter((areaKey) => areaKey !== key) : [...current, key]
    )
  }
  const showAllAreas = () => setDraftHiddenAreaKeys([])
  const hideAllAreas = () => setDraftHiddenAreaKeys(allAreaGroups.map((group) => group.key))

  return (
    <div className="pb-24">
      <div className="max-w-4xl mx-auto px-8 pt-8">
        <div className="sticky top-0 z-30 -mx-8 mb-6 border-b border-gray-800/70 bg-gray-950/90 px-8 py-3 backdrop-blur-md">
          <div className="flex items-center justify-between gap-4">
            <nav className="flex min-w-0 items-center gap-1.5 text-sm">
              <Link to="/" className="text-gray-500 hover:text-gray-300 transition-colors">
                Projects
              </Link>
              <span className="text-gray-700">›</span>
              <Link
                to={`/projects/${testSet.projectId}`}
                className="truncate text-gray-500 transition-colors hover:text-gray-300">
                {project?.name ?? 'Project'}
              </Link>
              <span className="text-gray-700">›</span>
              <span className="flex-shrink-0 text-gray-400">Test set</span>
            </nav>
            <div className="flex flex-shrink-0 items-center gap-2">
              <span
                className={`rounded-lg border px-2 py-1 text-[11px] ${
                  isEmptyReview
                    ? 'border-gray-700/40 bg-gray-700/30 text-gray-400'
                    : STATUS_STYLES[testSet.status]
                }`}>
                {isEmptyReview ? 'Empty review' : STATUS_LABELS[testSet.status]}
              </span>
              <div className="hidden items-center gap-2 sm:flex">
                <span className="text-xs text-gray-500">{compactProgressLabel}</span>
                <div className="h-1 w-20 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                    style={{width: `${progress}%`}}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span
                className={`px-2.5 py-1 text-xs border rounded-lg ${
                  isEmptyReview
                    ? 'bg-gray-700/30 text-gray-400 border-gray-700/40'
                    : STATUS_STYLES[testSet.status]
                }`}>
                {isEmptyReview ? 'Empty review' : STATUS_LABELS[testSet.status]}
              </span>
              <span className="text-xs text-gray-600">
                {new Date(testSet.createdAt).toLocaleDateString('en-US', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <h1 className="text-lg font-mono font-medium text-gray-200 leading-snug">
              {isEmptyReview ? 'No relevant tests for this analysis' : testSet.name}
            </h1>
            {isEmptyReview && (
              <p className="mt-1 font-mono text-xs text-gray-600">{testSet.name}</p>
            )}
            {testSet.resolutionNote && (
              <p className="mt-2 text-sm text-gray-500">Resolution: {testSet.resolutionNote}</p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => deleteTestSet(isClosedReview)}
              disabled={deleting}
              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 text-xs font-medium rounded-lg transition-colors border border-red-500/20">
              {isClosedReview ? 'Delete & rewind' : 'Delete'}
            </button>
          </div>
        </div>

        {!isEmptyReview && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>
                {doneTests} of {totalTests} completed
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{width: `${progress}%`}}
              />
            </div>
          </div>
        )}

        {isEmptyReview && (
          <div className="mb-6 rounded-xl border border-gray-800/60 bg-gray-900/40 p-4">
            <p className="text-sm text-gray-300">
              AI did not find any in-scope changes to test in this analysis. The analyzed commit
              range is recorded above. You can:
            </p>
            <ul className="mt-2 space-y-1 pl-4 text-sm text-gray-400">
              <li className="list-disc">
                <span className="text-gray-300 font-medium">Not relevant</span> to advance the
                analysis cursor with no retest required.
              </li>
              <li className="list-disc">Add a manual test below if you disagree with the AI.</li>
              <li className="list-disc">
                <span className="text-gray-300 font-medium">Delete &amp; rewind</span> to discard
                this review and re-analyze later.
              </li>
            </ul>
          </div>
        )}

        <TestSetInsights testSet={testSet} />

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Test Cases
            </h2>
            <div className="flex items-center gap-3 text-xs">
              {totalTests > 0 && (
                <>
                  <button
                    onClick={() => {
                      if (areaFilterOpen) setHiddenAreaKeys(draftHiddenAreaKeys)
                      setViewMode('priority')
                      setAreaFilterOpen(false)
                    }}
                    className={`px-2 py-1 rounded ${
                      viewMode === 'priority' ? 'bg-indigo-500/15 text-indigo-300' : 'text-gray-600'
                    }`}>
                    By priority
                  </button>
                  <button
                    onClick={() => {
                      if (areaFilterOpen) setHiddenAreaKeys(draftHiddenAreaKeys)
                      setViewMode('update')
                      setAreaFilterOpen(false)
                    }}
                    className={`px-2 py-1 rounded ${
                      viewMode === 'update' ? 'bg-indigo-500/15 text-indigo-300' : 'text-gray-600'
                    }`}>
                    By update
                  </button>
                  <div ref={areaFilterRef} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode('area')
                        if (viewMode === 'area' && areaFilterOpen) {
                          setHiddenAreaKeys(draftHiddenAreaKeys)
                          setAreaFilterOpen(false)
                        } else {
                          setDraftHiddenAreaKeys(hiddenAreaKeys)
                          setAreaFilterOpen(true)
                        }
                      }}
                      className={`px-2 py-1 rounded ${
                        viewMode === 'area' ? 'bg-indigo-500/15 text-indigo-300' : 'text-gray-600'
                      }`}>
                      By area
                      {displayHiddenAreaCount > 0 && (
                        <span className="ml-1 text-indigo-300/70">
                          {visibleAreaCount}/{allAreaGroups.length}
                        </span>
                      )}
                    </button>
                    {areaFilterOpen && viewMode === 'area' && (
                      <div className="absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-xl border border-gray-700/70 bg-gray-950 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-gray-800/70 px-3 py-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            Areas
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={showAllAreas}
                              disabled={draftHiddenAreaCount === 0}
                              className={`text-[11px] transition-colors ${
                                draftHiddenAreaCount === 0
                                  ? 'cursor-not-allowed text-gray-700'
                                  : 'text-indigo-300/80 hover:text-indigo-200'
                              }`}>
                              Show all
                            </button>
                            <span className="text-gray-800">/</span>
                            <button
                              type="button"
                              onClick={hideAllAreas}
                              disabled={allAreaGroups.length === draftHiddenAreaCount}
                              className={`text-[11px] transition-colors ${
                                allAreaGroups.length === draftHiddenAreaCount
                                  ? 'cursor-not-allowed text-gray-700'
                                  : 'text-gray-500 hover:text-gray-300'
                              }`}>
                              Hide all
                            </button>
                          </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto p-1.5">
                          {allAreaGroups.map((group) => {
                            const visible = !draftHiddenAreaKeys.includes(group.key)
                            return (
                              <button
                                key={group.key}
                                type="button"
                                onClick={() => toggleAreaFilter(group.key)}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-900">
                                <span
                                  className={`flex h-4 w-4 items-center justify-center rounded border ${
                                    visible
                                      ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-200'
                                      : 'border-gray-700 bg-gray-900 text-transparent'
                                  }`}>
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                    <path
                                      d="M1.5 5l2.2 2.2L8.5 2.5"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </span>
                                <span
                                  className={`inline-flex min-w-0 max-w-[8.5rem] items-center truncate rounded border px-1.5 py-0.5 text-xs font-medium ${
                                    group.isFallback
                                      ? 'border-gray-700/70 bg-gray-800/50 text-gray-400'
                                      : getAreaBadgeStyle(group.label)
                                  }`}>
                                  {group.label}
                                </span>
                                <span className="ml-auto text-[11px] text-gray-600">
                                  {group.tests.length}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  {(
                    [
                      {
                        status: 'pass',
                        label: 'pass',
                        count: passCount,
                        on: 'text-emerald-500 hover:text-emerald-400',
                        off: 'text-gray-700 line-through hover:text-gray-600',
                      },
                      {
                        status: 'fail',
                        label: 'fail',
                        count: failedTests,
                        on: 'text-red-400 hover:text-red-300',
                        off: 'text-gray-700 line-through hover:text-gray-600',
                      },
                      {
                        status: 'not_tested',
                        label: 'pending',
                        count: tests.filter((t) => t.status === 'not_tested').length,
                        on: 'text-gray-500 hover:text-gray-400',
                        off: 'text-gray-700 line-through hover:text-gray-600',
                      },
                      ...(skipCount > 0
                        ? [
                            {
                              status: 'skip',
                              label: 'skip',
                              count: skipCount,
                              on: 'text-gray-600 hover:text-gray-500',
                              off: 'text-gray-700 line-through hover:text-gray-600',
                            },
                          ]
                        : []),
                    ] as {
                      status: Test['status']
                      label: string
                      count: number
                      on: string
                      off: string
                    }[]
                  ).map(({status, label, count, on, off}) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => toggleStatus(status)}
                      className={`px-2 py-1 rounded transition-colors ${hiddenStatuses.includes(status) ? off : on}`}>
                      {count} {label}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {totalTests === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-800/70 bg-gray-900/30 px-4 py-6 text-center text-sm text-gray-500">
              No test cases yet.
            </div>
          ) : visibleTests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-800/70 bg-gray-900/30 px-4 py-6 text-center text-sm text-gray-500">
              No tests match the selected statuses.
            </div>
          ) : viewMode === 'priority' ? (
            <div className="space-y-1.5">
              {sortedTests.map((test) => (
                <TestItem
                  key={test.id}
                  test={test}
                  metadata={runById.get(test.analysisRunId ?? '')?.label}
                  onStatusChange={(status) => updateTestStatus(test, status)}
                  onDelete={() => deleteTest(test.id)}
                  onNoteChange={(note) => updateTestNote(test.id, note)}
                  onAttachmentUpload={(file) => uploadTestAttachment(test.id, file)}
                  onAttachmentDelete={(attId) => deleteTestAttachment(test.id, attId)}
                />
              ))}
            </div>
          ) : viewMode === 'update' ? (
            <div className="space-y-5">
              {(testSet.analysisRuns ?? []).map((run) => {
                const allRunTests = tests.filter((test) => test.analysisRunId === run.id)
                const runTests = sortTestsByPriority(
                  allRunTests.filter((t) => !hiddenStatuses.includes(t.status))
                )
                if (allRunTests.length > 0 && runTests.length === 0) return null
                const branchCount = Object.keys(run.commitRanges).length
                return (
                  <section key={run.id}>
                    <div className="mb-3">
                      <div className="flex items-center gap-3">
                        <span className="rounded-md border border-indigo-400/25 bg-indigo-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
                          Update
                        </span>
                        <span className="min-w-0 truncate text-sm font-semibold text-gray-200">
                          {run.label}
                        </span>
                        <span className="h-px min-w-6 flex-1 bg-gradient-to-r from-indigo-500/35 to-transparent" />
                        <span className="flex-shrink-0 rounded-full border border-gray-700/70 bg-gray-950/60 px-2 py-1 text-[11px] text-gray-400">
                          {branchCount} branch range{branchCount === 1 ? '' : 's'}
                        </span>
                        {runTests.length === 0 && (
                          <span className="flex-shrink-0 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-300">
                            no new tests
                          </span>
                        )}
                      </div>
                      {runTests.length === 0 && run.aiSummary && (
                        <p className="mt-2 rounded-lg border border-gray-800/70 bg-gray-900/40 px-3 py-2 text-xs leading-relaxed text-gray-500">
                          {run.aiSummary}
                        </p>
                      )}
                    </div>
                    {runTests.length > 0 && (
                      <div className="space-y-1.5">
                        {runTests.map((test) => (
                          <TestItem
                            key={test.id}
                            test={test}
                            onStatusChange={(status) => updateTestStatus(test, status)}
                            onDelete={() => deleteTest(test.id)}
                            onNoteChange={(note) => updateTestNote(test.id, note)}
                            onAttachmentUpload={(file) => uploadTestAttachment(test.id, file)}
                            onAttachmentDelete={(attId) => deleteTestAttachment(test.id, attId)}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          ) : (
            <div className="space-y-5">
              {areaGroups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-800/70 bg-gray-900/30 px-4 py-6 text-center text-sm text-gray-500">
                  No test cases match the selected areas.
                </div>
              ) : (
                areaGroups.map((group) => (
                  <section key={group.key}>
                    <div className="mb-2 rounded-xl border border-gray-800/70 bg-gray-900/60 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={`inline-flex items-center rounded border px-2 py-1 text-xs font-medium ${
                            group.isFallback
                              ? 'border-gray-700/70 bg-gray-800/50 text-gray-400'
                              : getAreaBadgeStyle(group.label)
                          }`}>
                          {group.label}
                        </span>
                        <span className="text-xs text-gray-600">
                          {group.tests.length} test{group.tests.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {group.tests.map((test) => (
                        <TestItem
                          key={test.id}
                          test={test}
                          metadata={runById.get(test.analysisRunId ?? '')?.label}
                          onStatusChange={(status) => updateTestStatus(test, status)}
                          onDelete={() => deleteTest(test.id)}
                          onNoteChange={(note) => updateTestNote(test.id, note)}
                          onAttachmentUpload={(file) => uploadTestAttachment(test.id, file)}
                          onAttachmentDelete={(attId) => deleteTestAttachment(test.id, attId)}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          )}

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
              {isEmptyReview ? (
                <span>Mark this range as not relevant to advance the analysis cursor.</span>
              ) : (
                <span>
                  Mark this test set as reviewed, or skip it if it is not relevant for QA.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => closeReview('not_required')}
                disabled={marking}
                className="px-4 py-2.5 border border-gray-700 hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 font-medium text-sm rounded-lg transition-colors">
                Not relevant
              </button>
              <button
                onClick={() => closeReview('reviewed')}
                disabled={marking}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-colors">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M2 7l3.5 3.5L12 3.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {marking ? 'Saving...' : 'Mark reviewed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
