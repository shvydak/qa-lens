import {useState, useEffect, useRef} from 'react'
import {useParams, Link, useNavigate} from 'react-router-dom'
import {apiFetch} from '../api/client.ts'
import type {TestSet, Test, Project} from '../types/index.ts'
import {useActiveProject} from '../contexts/ActiveProjectContext.tsx'
import TestItem, {getAreaBadgeStyle} from '../components/tests/TestItem.tsx'
import AddTestForm, {type AddTestPayload} from '../components/tests/AddTestForm.tsx'
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
  const [selectedStatuses, setSelectedStatuses] = useState<Test['status'][]>([])
  const [areaFilterOpen, setAreaFilterOpen] = useState(false)
  const [hiddenAreaKeys, setHiddenAreaKeys] = useState<string[]>([])
  const [draftHiddenAreaKeys, setDraftHiddenAreaKeys] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingTest, setEditingTest] = useState<Test | null>(null)
  const [highlightedTestId, setHighlightedTestId] = useState<string | null>(null)
  const [hiddenAddedTest, setHiddenAddedTest] = useState<{id: string; label: string} | null>(null)
  const [undoItem, setUndoItem] = useState<{
    testId: string
    label: string
    prevStatus: Test['status']
    timerId: number
  } | null>(null)
  const areaFilterRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

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
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target === searchInputRef.current) return
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return
      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

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

  useEffect(() => {
    if (!highlightedTestId) return
    const id = window.requestAnimationFrame(() => {
      const el = document.querySelector(`[data-test-id="${highlightedTestId}"]`)
      if (el && el instanceof HTMLElement) {
        el.scrollIntoView({behavior: 'smooth', block: 'center'})
      }
    })
    const timeout = window.setTimeout(() => setHighlightedTestId(null), 1800)
    return () => {
      window.cancelAnimationFrame(id)
      window.clearTimeout(timeout)
    }
  }, [highlightedTestId])

  const updateTestStatus = async (test: Test, newStatus: Test['status']) => {
    const prevStatus = test.status
    const updated = await apiFetch<Test>('PATCH', `/api/tests/${test.id}`, {status: newStatus})
    setTests((ts) => ts.map((t) => (t.id === updated.id ? updated : t)))
    invalidateTestSets()

    if (selectedStatuses.length > 0 && !selectedStatuses.includes(newStatus)) {
      if (undoItem) window.clearTimeout(undoItem.timerId)
      const timerId = window.setTimeout(() => setUndoItem(null), 4000)
      setUndoItem({
        testId: updated.id,
        label: updated.title || updated.description,
        prevStatus,
        timerId,
      })
    }
  }

  const handleUndo = async () => {
    if (!undoItem) return
    window.clearTimeout(undoItem.timerId)
    const {testId, prevStatus} = undoItem
    setUndoItem(null)
    const restored = await apiFetch<Test>('PATCH', `/api/tests/${testId}`, {status: prevStatus})
    setTests((ts) => ts.map((t) => (t.id === restored.id ? restored : t)))
    invalidateTestSets()
    setHighlightedTestId(restored.id)
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

  const addTest = async (data: AddTestPayload) => {
    const test = await apiFetch<Test>('POST', `/api/test-sets/${id}/tests`, data)
    setTests((ts) => [...ts, test])

    const q = searchQuery.trim().toLowerCase()
    const passesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(test.status)
    const passesSearch =
      q === '' ||
      test.description.toLowerCase().includes(q) ||
      (test.title ?? '').toLowerCase().includes(q) ||
      (test.area ?? '').toLowerCase().includes(q)

    if (!passesStatus || !passesSearch) {
      setHiddenAddedTest({id: test.id, label: test.title || test.description})
      setHighlightedTestId(null)
    } else {
      setHiddenAddedTest(null)
      setHighlightedTestId(test.id)
    }
  }

  const updateTest = async (testId: string, data: AddTestPayload) => {
    const updated = await apiFetch<Test>('PATCH', `/api/tests/${testId}`, data)
    setTests((ts) => ts.map((t) => (t.id === updated.id ? updated : t)))
    invalidateTestSets()
    setHighlightedTestId(updated.id)
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
    setSelectedStatuses((prev) => {
      const next = prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
      const distinctStatuses = new Set(tests.map((t) => t.status))
      return [...distinctStatuses].every((s) => next.includes(s)) ? [] : next
    })
  }

  const q = searchQuery.trim().toLowerCase()
  const visibleTests = tests.filter(
    (t) =>
      (selectedStatuses.length === 0 || selectedStatuses.includes(t.status)) &&
      (q === '' ||
        t.description.toLowerCase().includes(q) ||
        (t.area ?? '').toLowerCase().includes(q))
  )

  const passCount = tests.filter((t) => t.status === 'pass').length
  const skipCount = tests.filter((t) => t.status === 'skip').length

  const sortedTests = sortTestsByPriority(visibleTests)
  const runById = new Map((testSet.analysisRuns ?? []).map((run) => [run.id, run]))
  const allAreaGroups = groupTestsByArea(tests)
  const areaGroups = allAreaGroups
    .filter((group) => !hiddenAreaKeys.includes(group.key))
    .map((group) => ({
      ...group,
      tests: sortTestsByPriority(
        group.tests.filter(
          (t) =>
            (selectedStatuses.length === 0 || selectedStatuses.includes(t.status)) &&
            (q === '' ||
              t.description.toLowerCase().includes(q) ||
              (t.area ?? '').toLowerCase().includes(q))
        )
      ),
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
            {isEmptyReview && (
              <p className="text-sm text-gray-400">No relevant tests for this analysis</p>
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
          <div className="sticky top-[51px] z-10 flex items-center gap-4 py-3 mb-1 bg-gray-950 border-b border-gray-800/60">
            <>
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex-shrink-0">
                  Test Cases
                </h2>
                <div
                  onClick={() => searchInputRef.current?.focus()}
                  className={`h-8 flex items-center gap-2 rounded-lg px-3 text-sm border transition-colors cursor-text ${
                    searchQuery || searchFocused
                      ? 'bg-gray-900 border-indigo-500/30 flex-1 min-w-0'
                      : 'bg-gray-900 border-gray-800/60 hover:border-gray-700'
                  }`}>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 14 14"
                    fill="none"
                    className={`flex-shrink-0 ${searchQuery || searchFocused ? 'text-indigo-400' : 'text-gray-500'}`}>
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                    <path
                      d="M9.5 9.5L12.5 12.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  {!searchFocused && !searchQuery && (
                    <span className="text-gray-500 select-none">Search</span>
                  )}
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setSearchQuery('')
                        searchInputRef.current?.blur()
                      }
                    }}
                    placeholder="Search..."
                    className={`bg-transparent outline-none placeholder-gray-600 text-gray-300 transition-all min-w-0 ${searchQuery || searchFocused ? 'flex-1' : 'w-0 flex-none'}`}
                  />
                  {searchQuery ? (
                    <>
                      <span className="text-gray-500 flex-shrink-0">{visibleTests.length}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('')
                          searchInputRef.current?.focus()
                        }}
                        className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0 leading-none">
                        ×
                      </button>
                    </>
                  ) : (
                    !searchFocused && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <kbd className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
                          ⌘
                        </kbd>
                        <kbd className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
                          K
                        </kbd>
                      </div>
                    )
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm flex-shrink-0 flex-nowrap">
                {totalTests > 0 && (
                  <>
                    <button
                      onClick={() => {
                        if (areaFilterOpen) setHiddenAreaKeys(draftHiddenAreaKeys)
                        setViewMode('priority')
                        setAreaFilterOpen(false)
                      }}
                      className={`px-2 py-1 rounded ${
                        viewMode === 'priority'
                          ? 'bg-indigo-500/15 text-indigo-300'
                          : 'text-gray-600'
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
                          idle: 'text-emerald-500 hover:text-emerald-400',
                          active: 'bg-emerald-500/15 text-emerald-400',
                          inactive: 'text-gray-600 hover:text-gray-400',
                        },
                        {
                          status: 'fail',
                          label: 'fail',
                          count: failedTests,
                          idle: 'text-red-400 hover:text-red-300',
                          active: 'bg-red-500/15 text-red-400',
                          inactive: 'text-gray-600 hover:text-gray-400',
                        },
                        {
                          status: 'not_tested',
                          label: 'pending',
                          count: tests.filter((t) => t.status === 'not_tested').length,
                          idle: 'text-gray-500 hover:text-gray-400',
                          active: 'bg-gray-700/60 text-gray-300',
                          inactive: 'text-gray-600 hover:text-gray-400',
                        },
                        ...(skipCount > 0
                          ? [
                              {
                                status: 'skip',
                                label: 'skip',
                                count: skipCount,
                                idle: 'text-gray-600 hover:text-gray-500',
                                active: 'bg-gray-700/40 text-gray-400',
                                inactive: 'text-gray-600 hover:text-gray-400',
                              },
                            ]
                          : []),
                      ] as {
                        status: Test['status']
                        label: string
                        count: number
                        idle: string
                        active: string
                        inactive: string
                      }[]
                    ).map(({status, label, count, idle, active, inactive}) => {
                      const isFiltering = selectedStatuses.length > 0
                      const isSelected = selectedStatuses.includes(status)
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => toggleStatus(status)}
                          className={`px-2 py-1 rounded transition-colors ${
                            !isFiltering ? idle : isSelected ? active : inactive
                          }`}>
                          {count} {label}
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            </>
          </div>

          {totalTests === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-800/70 bg-gray-900/30 px-4 py-6 text-center text-sm text-gray-500">
              No test cases yet.
            </div>
          ) : visibleTests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-800/70 bg-gray-900/30 px-4 py-6 text-center text-sm text-gray-500">
              {searchQuery
                ? `No tests match "${searchQuery}".`
                : 'No tests match the selected statuses.'}
            </div>
          ) : viewMode === 'priority' ? (
            <div className="space-y-1.5">
              {sortedTests.map((test) => (
                <TestItem
                  key={test.id}
                  test={test}
                  metadata={runById.get(test.analysisRunId ?? '')?.label}
                  highlighted={highlightedTestId === test.id}
                  onStatusChange={(status) => updateTestStatus(test, status)}
                  onDelete={() => deleteTest(test.id)}
                  onEdit={testSet.status === 'active' ? () => setEditingTest(test) : undefined}
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
                  selectedStatuses.length === 0
                    ? allRunTests
                    : allRunTests.filter((t) => selectedStatuses.includes(t.status))
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
                            highlighted={highlightedTestId === test.id}
                            onStatusChange={(status) => updateTestStatus(test, status)}
                            onDelete={() => deleteTest(test.id)}
                            onEdit={
                              testSet.status === 'active' ? () => setEditingTest(test) : undefined
                            }
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
                          highlighted={highlightedTestId === test.id}
                          onStatusChange={(status) => updateTestStatus(test, status)}
                          onDelete={() => deleteTest(test.id)}
                          onEdit={
                            testSet.status === 'active' ? () => setEditingTest(test) : undefined
                          }
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
        </div>
      </div>

      {undoItem && (
        <div className="fixed bottom-24 left-1/2 z-40 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-gray-700/60 bg-gray-900/95 px-4 py-3 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-gray-300">{undoItem.label}</p>
              <p className="mt-0.5 text-xs text-gray-500">Moved out of current filter view</p>
            </div>
            <button
              type="button"
              onClick={handleUndo}
              className="flex-shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-700">
              Undo
            </button>
            <button
              type="button"
              onClick={() => {
                window.clearTimeout(undoItem.timerId)
                setUndoItem(null)
              }}
              aria-label="Dismiss"
              className="flex-shrink-0 rounded-md p-1 text-gray-600 transition-colors hover:bg-gray-800/60 hover:text-gray-400">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 3l6 6M9 3l-6 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {hiddenAddedTest && (
        <div className="fixed bottom-24 left-1/2 z-40 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-indigo-500/30 bg-gray-900/95 px-4 py-3 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-indigo-300">
                Added — hidden by current filter
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-400">{hiddenAddedTest.label}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedStatuses([])
                setSearchQuery('')
                setHighlightedTestId(hiddenAddedTest.id)
                setHiddenAddedTest(null)
              }}
              className="flex-shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500">
              Show
            </button>
            <button
              type="button"
              onClick={() => setHiddenAddedTest(null)}
              aria-label="Dismiss"
              className="flex-shrink-0 rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-800/60 hover:text-gray-300">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 3l6 6M9 3l-6 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {testSet.status === 'active' && !addModalOpen && !editingTest && (
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          aria-label="Add test"
          title="Add test"
          className="group fixed bottom-24 right-8 z-40 flex h-12 items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-600 pl-3.5 pr-4 text-sm font-medium text-white shadow-xl shadow-indigo-900/40 transition-all hover:bg-indigo-500 hover:shadow-2xl hover:shadow-indigo-900/50 focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:ring-offset-2 focus:ring-offset-gray-950">
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
            <path
              d="M6 1.5v9M1.5 6h9"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          Add test
        </button>
      )}

      <AddTestForm
        open={addModalOpen || editingTest !== null}
        initialTest={editingTest ?? undefined}
        onClose={() => {
          setAddModalOpen(false)
          setEditingTest(null)
        }}
        onSubmit={(data) => (editingTest ? updateTest(editingTest.id, data) : addTest(data))}
      />

      {testSet.status === 'active' && (
        <div className="fixed bottom-0 left-56 right-0 z-30 bg-gray-950/90 backdrop-blur-md border-t border-gray-800/60 px-8 py-4">
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
