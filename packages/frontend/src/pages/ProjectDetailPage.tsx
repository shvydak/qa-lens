import {useState, useEffect, useCallback, useRef} from 'react'
import {useParams, useNavigate, Link} from 'react-router-dom'
import {apiFetch} from '../api/client.ts'
import type {Project, Repository, TestSet, AnalysisStatus, RemoteBranch} from '../types/index.ts'
import RepoCard from '../components/repositories/RepoCard.tsx'
import RepoForm from '../components/repositories/RepoForm.tsx'
import AnalysisPanel from '../components/testSets/AnalysisPanel.tsx'
import TestSetCard from '../components/testSets/TestSetCard.tsx'

export default function ProjectDetailPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [repos, setRepos] = useState<Repository[]>([])
  const [testSets, setTestSets] = useState<TestSet[]>([])
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>({
    running: false,
    testSetId: null,
    error: null,
  })
  const [showRepoForm, setShowRepoForm] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncingRepoId, setSyncingRepoId] = useState<string | null>(null)
  const [untrackedBranchesByRepo, setUntrackedBranchesByRepo] = useState<
    Record<string, RemoteBranch[]>
  >({})
  const [repoListSync, setRepoListSync] = useState<{
    okAt: number | null
    listError: string | null
    errorByRepoId: Record<string, string>
  }>({okAt: null, listError: null, errorByRepoId: {}})

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analysisPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeBranchSignature = repos
    .map((repo) => repo.activeBranch?.id)
    .filter(Boolean)
    .sort()
    .join('|')
  const activeTestSet = testSets.find(
    (testSet) =>
      testSet.status === 'active' &&
      (!testSet.branchSignature || testSet.branchSignature === activeBranchSignature)
  )
  const testSetHistoryGroups = groupTestSetsByBranchCombination(testSets, activeBranchSignature)
  const activeBranchNames = repos
    .map((repo) => repo.activeBranch?.name ?? repo.branch)
    .filter(Boolean)
  const hasUnanalyzedCommits = repos.some((repo) => (repo.unanalyzedCount ?? 0) > 0)
  const analysisDisabled = !activeTestSet && !hasUnanalyzedCommits
  const analysisDisabledReason = 'There are no new commits to analyze'
  const analysisActionLabel = activeTestSet ? 'Update Active Test Set' : 'Run Analysis'
  const analysisHelpText = activeTestSet
    ? 'AI will append tests for commits added after the active test set was created'
    : 'AI will analyze all new commits across all repositories'

  const loadRepos = useCallback(async () => {
    if (!id) return
    try {
      const data = await apiFetch<Repository[]>('GET', `/api/projects/${id}/repos`)
      setRepos(data)
      setRepoListSync((current) => ({
        okAt: Date.now(),
        listError: null,
        errorByRepoId: current.errorByRepoId,
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh repositories'
      setRepoListSync((current) => ({
        okAt: current.okAt,
        listError: message,
        errorByRepoId: current.errorByRepoId,
      }))
    }
  }, [id])

  const loadTestSets = useCallback(async () => {
    if (!id) return
    const data = await apiFetch<TestSet[]>('GET', `/api/projects/${id}/test-sets`)
    setTestSets(data)
  }, [id])

  const loadAnalysisStatus = useCallback(
    async (navigateOnComplete = false) => {
      if (!id) return
      const data = await apiFetch<AnalysisStatus>('GET', `/api/projects/${id}/analyze/status`)
      setAnalysisStatus(data)
      if (navigateOnComplete && !data.running && data.testSetId) {
        clearInterval(analysisPollRef.current!)
        await loadTestSets()
        navigate(`/test-sets/${data.testSetId}`)
      }
      if (!data.running && data.error) {
        clearInterval(analysisPollRef.current!)
      }
    },
    [id, loadTestSets, navigate]
  )

  useEffect(() => {
    if (!id) return
    const init = async () => {
      try {
        const [proj] = await Promise.all([
          apiFetch<Project>('GET', `/api/projects/${id}`),
          loadRepos(),
          loadTestSets(),
          loadAnalysisStatus(),
        ])
        setProject(proj)
        setDescDraft(proj.description)
      } finally {
        setLoading(false)
      }
    }
    init()

    pollRef.current = setInterval(loadRepos, 10_000)
    return () => {
      clearInterval(pollRef.current!)
      clearInterval(analysisPollRef.current!)
    }
  }, [id, loadRepos, loadTestSets, loadAnalysisStatus])

  const startAnalysis = async () => {
    if (!id || analysisDisabled) return
    setAnalysisStatus({running: true, testSetId: null, error: null})
    try {
      await apiFetch('POST', `/api/projects/${id}/analyze`, {})
    } catch (err) {
      setAnalysisStatus({
        running: false,
        testSetId: null,
        error: err instanceof Error ? err.message : 'Error',
      })
      return
    }
    analysisPollRef.current = setInterval(() => loadAnalysisStatus(true), 2_000)
  }

  const saveDescription = async () => {
    if (!project) return
    const updated = await apiFetch<Project>('PATCH', `/api/projects/${project.id}`, {
      description: descDraft,
    })
    setProject(updated)
    setEditingDesc(false)
  }

  const deleteRepo = async (repoId: string) => {
    await apiFetch('DELETE', `/api/repos/${repoId}`)
    setRepos((r) => r.filter((x) => x.id !== repoId))
  }

  const fetchRepo = async (repoId: string) => {
    setSyncingRepoId(repoId)
    try {
      await apiFetch('POST', `/api/repos/${repoId}/fetch`, {})
      setRepoListSync((current) => {
        const next = {...current.errorByRepoId}
        delete next[repoId]
        return {okAt: Date.now(), listError: null, errorByRepoId: next}
      })
      await loadRepos()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fetch failed'
      setRepoListSync((current) => ({
        okAt: current.okAt,
        listError: current.listError,
        errorByRepoId: {...current.errorByRepoId, [repoId]: message},
      }))
    } finally {
      setSyncingRepoId(null)
    }
  }

  const changeRepoBranch = async (repoId: string, branchId: string) => {
    const updated = await apiFetch<Repository>('PATCH', `/api/repos/${repoId}/active-branch`, {
      branchId,
    })
    setRepos((current) => current.map((repo) => (repo.id === repoId ? updated : repo)))
    await loadRepos()
  }

  const syncRepoBranches = async (repoId: string) => {
    setSyncingRepoId(repoId)
    try {
      const result = await apiFetch<{repo: Repository; untrackedBranches: RemoteBranch[]}>(
        'POST',
        `/api/repos/${repoId}/sync-branches`,
        {}
      )
      setRepos((current) => current.map((repo) => (repo.id === repoId ? result.repo : repo)))
      setUntrackedBranchesByRepo((current) => ({
        ...current,
        [repoId]: result.untrackedBranches,
      }))
    } finally {
      setSyncingRepoId(null)
    }
  }

  const trackRepoBranch = async (repoId: string, branchName: string) => {
    const updated = await apiFetch<Repository>('POST', `/api/repos/${repoId}/branches`, {
      branchName,
    })
    setRepos((current) => current.map((repo) => (repo.id === repoId ? updated : repo)))
    setUntrackedBranchesByRepo((current) => ({
      ...current,
      [repoId]: (current[repoId] ?? []).filter((branch) => branch.name !== branchName),
    }))
  }

  const archiveRepoBranch = async (repoId: string, branchId: string) => {
    const updated = await apiFetch<Repository>(
      'PATCH',
      `/api/repos/${repoId}/branches/${branchId}`,
      {
        status: 'archived',
      }
    )
    setRepos((current) => current.map((repo) => (repo.id === repoId ? updated : repo)))
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 w-48 bg-gray-900 rounded-lg animate-pulse" />
        <div className="h-4 w-64 bg-gray-900 rounded animate-pulse" />
      </div>
    )
  }

  if (!project) {
    return <div className="p-8 text-gray-500">Project not found</div>
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors mb-6">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M9 2L4 7l5 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Projects
      </Link>

      <div className="mb-7 rounded-2xl border border-gray-800/60 bg-gray-900/50 p-5 shadow-2xl shadow-black/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-100">{project.name}</h1>
              <span className="rounded-full border border-gray-800 bg-gray-950/60 px-2.5 py-1 text-xs text-gray-500">
                {repos.length} repo{repos.length === 1 ? '' : 's'}
              </span>
            </div>
            {activeBranchNames.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-gray-600">Active branches</span>
                {activeBranchNames.slice(0, 4).map((branchName, index) => (
                  <span
                    key={`${branchName}-${index}`}
                    className="rounded-md border border-indigo-500/15 bg-indigo-500/10 px-2 py-0.5 font-mono text-indigo-300">
                    {branchName}
                  </span>
                ))}
                {activeBranchNames.length > 4 && (
                  <span className="text-gray-600">+{activeBranchNames.length - 4}</span>
                )}
              </div>
            )}
          </div>

          {!editingDesc && (
            <button
              onClick={() => setEditingDesc(true)}
              className="self-start rounded-lg border border-gray-800 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:border-gray-700 hover:text-gray-300">
              Edit context
            </button>
          )}
        </div>

        <div className="mt-4 border-t border-gray-800/60 pt-4">
          {editingDesc ? (
            <div className="space-y-2">
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                rows={6}
                className="w-full px-3 py-2.5 bg-gray-950/70 border border-indigo-500/50 rounded-lg text-gray-100 text-sm focus:outline-none resize-none"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={saveDescription}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors">
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingDesc(false)
                    setDescDraft(project.description)
                  }}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : project.description ? (
            <button onClick={() => setEditingDesc(true)} className="group block w-full text-left">
              <p className="max-h-24 max-w-5xl overflow-y-auto pr-3 text-sm leading-6 text-gray-500 transition-colors group-hover:text-gray-400">
                {project.description}
              </p>
            </button>
          ) : (
            <button
              onClick={() => setEditingDesc(true)}
              className="text-sm text-gray-700 transition-colors hover:text-gray-500 italic">
              + Add project context for AI
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <div>
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                  Analysis
                </h2>
                <p className="mt-1 text-xs text-gray-600">
                  Create and continue QA test sets for the selected branch combination.
                </p>
              </div>
            </div>

            <AnalysisPanel
              status={analysisStatus}
              disabled={analysisDisabled}
              disabledReason={analysisDisabledReason}
              actionLabel={analysisActionLabel}
              helpText={analysisHelpText}
              activeMode={Boolean(activeTestSet)}
              onAnalyze={startAnalysis}
            />
          </div>

          {testSets.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                Test set history
              </h3>
              <div className="space-y-3">
                {testSetHistoryGroups.map((group) => (
                  <section
                    key={group.key}
                    className={`rounded-2xl border p-4 ${
                      group.isCurrent
                        ? 'border-indigo-500/25 bg-indigo-500/[0.04]'
                        : 'border-gray-800/50 bg-gray-900/35'
                    }`}>
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                            {group.isCurrent ? 'Current combination' : 'Branch combination'}
                          </span>
                          <span className="rounded-full bg-gray-800/70 px-2 py-0.5 text-[11px] text-gray-500">
                            {group.testSets.length} test set{group.testSets.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2" title={getGroupTooltip(group)}>
                          {group.targets.length > 0 ? (
                            group.targets.map((target) => (
                              <span
                                key={target.id}
                                className="rounded-lg border border-gray-700/60 bg-gray-950/45 px-2.5 py-1 font-mono text-sm text-indigo-200">
                                {target.branchName}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-600">{group.fallbackLabel}</span>
                          )}
                        </div>
                      </div>
                      <span className="flex-shrink-0 text-xs text-gray-600">
                        Latest {formatHistoryDate(group.latestAt)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {group.testSets.map((ts) => (
                        <TestSetCard key={ts.id} testSet={ts} showTargets={false} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="xl:sticky xl:top-8 xl:self-start">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                Repositories
              </h2>
              <p className="mt-1 text-xs text-gray-600">Setup and branch selection</p>
            </div>
            <button
              onClick={() => setShowRepoForm(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-lg transition-colors border border-gray-700/50">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path
                  d="M5.5 1v9M1 5.5h9"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              Add
            </button>
          </div>

          {repos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 bg-gray-900/50 border border-gray-800/50 rounded-xl text-center">
              <p className="text-gray-500 text-sm">No repositories</p>
              <p className="text-gray-700 text-xs mt-1">
                Connect GitHub repos and select branches from remote.
              </p>
              <button
                onClick={() => setShowRepoForm(true)}
                className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                Add first repo
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {repos.map((repo) => (
                <RepoCard
                  key={repo.id}
                  repo={repo}
                  listSyncOkAt={repoListSync.okAt}
                  listSyncError={repoListSync.listError}
                  fetchError={repoListSync.errorByRepoId[repo.id]}
                  onDelete={() => deleteRepo(repo.id)}
                  onFetch={() => fetchRepo(repo.id)}
                  onBranchChange={(branchId) => changeRepoBranch(repo.id, branchId)}
                  onSyncBranches={() => syncRepoBranches(repo.id)}
                  onTrackBranch={(branchName) => trackRepoBranch(repo.id, branchName)}
                  onArchiveBranch={(branchId) => archiveRepoBranch(repo.id, branchId)}
                  untrackedBranches={untrackedBranchesByRepo[repo.id]}
                  syncingBranches={syncingRepoId === repo.id}
                />
              ))}
            </div>
          )}
        </aside>
      </div>

      {showRepoForm && (
        <RepoForm
          projectId={id!}
          onClose={() => setShowRepoForm(false)}
          onAdd={(repo) => {
            setRepos((r) => [...r, repo])
            loadRepos()
            setShowRepoForm(false)
          }}
        />
      )}
    </div>
  )
}

interface TestSetHistoryGroup {
  key: string
  targets: NonNullable<TestSet['commitTargets']>
  fallbackLabel: string
  latestAt: string
  isCurrent: boolean
  testSets: TestSet[]
}

function groupTestSetsByBranchCombination(
  testSets: TestSet[],
  activeBranchSignature: string
): TestSetHistoryGroup[] {
  const groups = new Map<string, TestSetHistoryGroup>()

  for (const testSet of testSets) {
    const key = getHistoryGroupKey(testSet)
    const latestAt = testSet.latestAnalysisRunAt ?? testSet.createdAt
    const existing = groups.get(key)

    if (existing) {
      existing.testSets.push(testSet)
      if (new Date(latestAt).getTime() > new Date(existing.latestAt).getTime()) {
        existing.latestAt = latestAt
      }
      existing.isCurrent =
        existing.isCurrent ||
        Boolean(testSet.branchSignature && testSet.branchSignature === activeBranchSignature)
      if (existing.targets.length === 0 && testSet.commitTargets?.length) {
        existing.targets = testSet.commitTargets
      }
      continue
    }

    groups.set(key, {
      key,
      targets: testSet.commitTargets ?? [],
      fallbackLabel: getFallbackHistoryLabel(testSet),
      latestAt,
      isCurrent: Boolean(
        testSet.branchSignature && testSet.branchSignature === activeBranchSignature
      ),
      testSets: [testSet],
    })
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      testSets: [...group.testSets].sort((a, b) => getLatestTime(b) - getLatestTime(a)),
    }))
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
      return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
    })
}

function getHistoryGroupKey(testSet: TestSet): string {
  if (testSet.analysisContextId) return testSet.analysisContextId
  if (testSet.branchSignature) return testSet.branchSignature

  const targetSignature = (testSet.commitTargets ?? [])
    .map((target) => `${target.repositoryId}:${target.branchName}`)
    .sort()
    .join('|')
  if (targetSignature) return targetSignature

  return Object.keys(testSet.commitRanges).sort().join('|') || testSet.id
}

function getFallbackHistoryLabel(testSet: TestSet): string {
  const rangeCount = Object.keys(testSet.commitRanges).length
  return rangeCount > 0
    ? `${rangeCount} branch range${rangeCount === 1 ? '' : 's'}`
    : 'Unknown branch combination'
}

function getLatestTime(testSet: TestSet): number {
  return new Date(testSet.latestAnalysisRunAt ?? testSet.createdAt).getTime()
}

function formatHistoryDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getGroupTooltip(group: TestSetHistoryGroup): string {
  if (group.targets.length === 0) return group.fallbackLabel

  return group.targets
    .map(
      (target) =>
        `${repoName(target.repositoryPath)} / ${target.branchName}: ${target.from ?? 'start'}..${target.to}`
    )
    .join('\n')
}

function repoName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}
