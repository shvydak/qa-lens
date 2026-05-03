import type {RemoteBranch, Repository} from '../../types/index.ts'
import {useEffect, useRef, useState} from 'react'

function trimPathLeft(path: string, maxLen = 42): string {
  if (path.length <= maxLen) return path
  return '…' + path.slice(-(maxLen - 1))
}

function repoName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function LiveSyncDot({
  okAt,
  listError,
  fetchError,
}: {
  okAt: number | null
  listError: string | null
  fetchError?: string | null
}) {
  const error = fetchError ?? listError
  const healthy = Boolean(okAt) && !error

  return (
    <span
      className="relative inline-flex h-2 w-2"
      title={
        error
          ? error
          : healthy
            ? 'Repositories auto-refresh is running'
            : 'Waiting for the first refresh'
      }>
      {healthy && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-25 animate-ping" />
      )}
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${
          error ? 'bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.1)]' : 'bg-emerald-400'
        } ${healthy ? 'animate-pulse' : ''}`}
      />
    </span>
  )
}

export default function RepoCard({
  repo,
  listSyncOkAt = null,
  listSyncError = null,
  fetchError = null,
  onDelete,
  onFetch,
  onBranchChange,
  onSyncBranches,
  onTrackBranch,
  onArchiveBranch,
  untrackedBranches = [],
  syncingBranches = false,
}: {
  repo: Repository
  listSyncOkAt?: number | null
  listSyncError?: string | null
  fetchError?: string | null
  onDelete: () => void
  onFetch: () => Promise<void>
  onBranchChange: (branchId: string) => Promise<void>
  onSyncBranches: () => Promise<void>
  onTrackBranch: (branchName: string) => Promise<void>
  onArchiveBranch: (branchId: string) => Promise<void>
  untrackedBranches?: RemoteBranch[]
  syncingBranches?: boolean
}) {
  const analysisCursor = repo.analysisCursor ?? (repo.lastAnalyzedCommitHash ? 'baseline' : 'none')
  const hasNew = (repo.unanalyzedCount ?? 0) > 0
  const activeBranch = repo.activeBranch
  const [showBranches, setShowBranches] = useState(false)
  const [branchMenuOpen, setBranchMenuOpen] = useState(false)
  const branchMenuRef = useRef<HTMLDivElement | null>(null)
  const [untrackedMenuOpen, setUntrackedMenuOpen] = useState(false)
  const untrackedMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!branchMenuOpen && !untrackedMenuOpen) return

    const closeMenus = (event: MouseEvent) => {
      const target = event.target as Node
      if (branchMenuOpen && !branchMenuRef.current?.contains(target)) {
        setBranchMenuOpen(false)
      }
      if (untrackedMenuOpen && !untrackedMenuRef.current?.contains(target)) {
        setUntrackedMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', closeMenus)
    return () => document.removeEventListener('mousedown', closeMenus)
  }, [branchMenuOpen, untrackedMenuOpen])

  const analysisStatus = (() => {
    if (analysisCursor === 'none') {
      return {
        label: 'Initial analysis needed',
        showDot: true,
        dotClass: 'bg-amber-400',
        title: 'Run the first analysis to create tests for the current repository state',
      }
    }
    if (analysisCursor === 'active' && hasNew) {
      return {
        label: `${repo.unanalyzedCount} commits to add`,
        showDot: true,
        dotClass: 'bg-amber-400',
        title: 'New commits appeared after the active test set was created',
      }
    }
    if (analysisCursor === 'active') {
      return {
        label: 'In active analysis',
        showDot: false,
        dotClass: '',
        title: 'The current commits are already included in the active test set',
      }
    }
    if (hasNew) {
      return {
        label: `${repo.unanalyzedCount} new commits`,
        showDot: true,
        dotClass: 'bg-amber-400',
        title: 'There are new commits since the last passed analysis',
      }
    }
    return {
      label: 'Up to date',
      showDot: false,
      dotClass: '',
      title: 'No new commits detected for this repo',
    }
  })()

  return (
    <div className="group rounded-2xl border border-gray-800/60 bg-gray-900/70 p-4 transition-colors hover:border-gray-700/70">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-gray-800 border border-gray-700/50 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="2.5" r="1.5" stroke="#6b7280" strokeWidth="1.2" />
            <circle cx="2.5" cy="11.5" r="1.5" stroke="#6b7280" strokeWidth="1.2" />
            <circle cx="11.5" cy="11.5" r="1.5" stroke="#6b7280" strokeWidth="1.2" />
            <path
              d="M7 4v3.5M7 7.5l-3.5 2.5M7 7.5l3.5 2.5"
              stroke="#6b7280"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-gray-200" title={repo.localPath}>
                {repoName(repo.localPath)}
              </div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-gray-600">
                {trimPathLeft(repo.localPath, 34)}
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center pt-1">
              <LiveSyncDot okAt={listSyncOkAt} listError={listSyncError} fetchError={fetchError} />
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                Active branch
              </div>
              <div className="relative mt-1.5" ref={branchMenuRef}>
                {repo.branches.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setUntrackedMenuOpen(false)
                        setBranchMenuOpen((open) => !open)
                      }}
                      className="inline-flex w-full max-w-full items-center justify-between gap-2 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1.5 font-mono text-xs text-indigo-200 transition-colors hover:border-indigo-400/45 hover:bg-indigo-500/15 sm:max-w-[min(100%,16rem)]">
                      <span className="truncate">{activeBranch?.name ?? repo.branch}</span>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                        className="flex-shrink-0 text-indigo-300">
                        <path
                          d="M2 3.5L5 6.5L8 3.5"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {branchMenuOpen && (
                      <div className="absolute left-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-gray-700/70 bg-gray-950 shadow-2xl shadow-black/40">
                        <div className="border-b border-gray-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                          Select branch
                        </div>
                        <div className="max-h-56 overflow-y-auto p-1">
                          {repo.branches.map((branch) => {
                            const selected = branch.id === activeBranch?.id
                            const disabled = branch.status !== 'active'
                            return (
                              <button
                                key={branch.id}
                                type="button"
                                disabled={disabled}
                                onClick={async () => {
                                  setBranchMenuOpen(false)
                                  await onBranchChange(branch.id)
                                }}
                                className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left font-mono text-xs transition-colors ${
                                  selected
                                    ? 'bg-indigo-500/15 text-indigo-200'
                                    : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                                } ${disabled ? 'cursor-not-allowed opacity-45 hover:bg-transparent hover:text-gray-400' : ''}`}>
                                <span className="truncate">{branch.name}</span>
                                {selected ? (
                                  <span className="text-[10px] text-indigo-300">active</span>
                                ) : branch.status !== 'active' ? (
                                  <span className="text-[10px] text-amber-400">
                                    {branch.status}
                                  </span>
                                ) : null}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="inline-flex w-full max-w-full items-center rounded-lg border border-gray-800 bg-gray-950/40 px-2.5 py-1.5 font-mono text-xs text-gray-300 sm:max-w-[min(100%,16rem)]">
                    {repo.branch}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-end sm:gap-2">
              <div
                className={`flex min-w-0 items-center text-xs text-gray-400 ${
                  analysisStatus.showDot ? 'gap-2' : ''
                }`}
                title={analysisStatus.title}>
                {analysisStatus.showDot && (
                  <span
                    className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${analysisStatus.dotClass}`}
                  />
                )}
                <span className="truncate">{analysisStatus.label}</span>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={async () => {
                    setBranchMenuOpen(false)
                    setUntrackedMenuOpen(false)
                    setShowBranches(true)
                    await onSyncBranches()
                  }}
                  disabled={syncingBranches || !repo.githubUrl}
                  title="Manage branches"
                  className="rounded-lg px-2 py-1.5 text-xs text-gray-500 transition-all hover:bg-emerald-400/10 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
                  Branches
                </button>
                <button
                  onClick={onFetch}
                  title="Refresh commits now"
                  className="p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-all">
                  <svg
                    className={syncingBranches ? 'animate-spin' : ''}
                    width="13"
                    height="13"
                    viewBox="0 0 13 13"
                    fill="none">
                    <path
                      d="M10.8 4.2A4.8 4.8 0 0 0 2 3.5M2 1.2v2.3h2.3M2.2 8.8A4.8 4.8 0 0 0 11 9.5M11 11.8V9.5H8.7"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    const label = repo.githubUrl ?? repoName(repo.localPath)
                    if (
                      !window.confirm(`Remove "${label}" from this project? This cannot be undone.`)
                    ) {
                      return
                    }
                    onDelete()
                  }}
                  title="Delete"
                  className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M1.5 3h9M5 3V1.5h2V3M4.5 5v4.5M7.5 5v4.5M2 3l.5 7.5h7L10 3"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {showBranches && repo.branches.length > 0 && (
            <div className="mt-2 max-h-28 overflow-y-auto pr-1 flex flex-wrap gap-1.5">
              {repo.branches.map((branch) => {
                const statusClass =
                  branch.status === 'active'
                    ? branch.isActive
                      ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
                      : 'bg-gray-800/50 border-gray-700/40 text-gray-500'
                    : branch.status === 'missing'
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                      : 'bg-gray-950/60 border-gray-800 text-gray-600'
                return (
                  <span
                    key={branch.id}
                    title={
                      branch.status === 'missing'
                        ? 'Deleted from remote or inaccessible'
                        : branch.status
                    }
                    className={`text-[10px] px-1.5 py-0.5 border rounded font-mono ${statusClass}`}>
                    {branch.name}
                    {branch.status !== 'active' ? ` · ${branch.status}` : ''}
                    {!branch.isActive && branch.status !== 'archived' && (
                      <button
                        type="button"
                        onClick={() => onArchiveBranch(branch.id)}
                        className="ml-1 text-gray-500 hover:text-red-300">
                        archive
                      </button>
                    )}
                  </span>
                )
              })}
            </div>
          )}

          {showBranches && untrackedBranches.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                Remote branches
              </div>
              <div className="relative mt-1.5" ref={untrackedMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setBranchMenuOpen(false)
                    setUntrackedMenuOpen((open) => !open)
                  }}
                  className="inline-flex w-full max-w-full items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-950/45 px-2.5 py-1.5 font-mono text-xs text-gray-200 transition-colors hover:border-gray-700 hover:bg-gray-950/70 sm:max-w-[min(100%,16rem)]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">Track remote branch…</span>
                    <span className="flex-shrink-0 rounded-full border border-gray-800 bg-gray-900 px-2 py-0.5 text-[10px] text-gray-500">
                      {untrackedBranches.length}
                    </span>
                  </span>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    className="flex-shrink-0 text-gray-500">
                    <path
                      d="M2 3.5L5 6.5L8 3.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {untrackedMenuOpen && (
                  <div className="absolute left-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-gray-700/70 bg-gray-950 shadow-2xl shadow-black/40">
                    <div className="border-b border-gray-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                      Select branch to track
                    </div>
                    <div className="max-h-56 overflow-y-auto p-1">
                      {untrackedBranches.map((branch) => (
                        <button
                          key={branch.name}
                          type="button"
                          onClick={async () => {
                            setUntrackedMenuOpen(false)
                            await onTrackBranch(branch.name)
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left font-mono text-xs text-gray-300 transition-colors hover:bg-gray-900 hover:text-gray-100">
                          <span className="truncate">{branch.name}</span>
                          <span className="text-[10px] text-gray-600">track</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
