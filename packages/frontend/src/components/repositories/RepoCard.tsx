import type {RemoteBranch, Repository} from '../../types/index.ts'
import {useState} from 'react'

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function trimPathLeft(path: string, maxLen = 42): string {
  if (path.length <= maxLen) return path
  return '…' + path.slice(-(maxLen - 1))
}

export default function RepoCard({
  repo,
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

  return (
    <div className="group flex items-start gap-3 p-4 bg-gray-900 border border-gray-800/50 rounded-xl hover:border-gray-700/60 transition-colors">
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
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-xs text-gray-300 truncate" title={repo.localPath}>
            {trimPathLeft(repo.localPath)}
          </span>
          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400">
            GitHub connected
          </span>
          {repo.hasAuthToken && <span className="text-[10px] text-indigo-300">private access</span>}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">Active branch</span>
          {repo.branches.length > 1 ? (
            <select
              value={activeBranch?.id ?? ''}
              onChange={(event) => onBranchChange(event.target.value)}
              className="min-w-0 max-w-52 px-2 py-1 bg-gray-950/70 border border-gray-700/50 rounded-md text-xs text-gray-200 font-mono focus:outline-none focus:border-indigo-500/70">
              {repo.branches.map((branch) => (
                <option key={branch.id} value={branch.id} disabled={branch.status !== 'active'}>
                  {branch.name}
                  {branch.status !== 'active' ? ` (${branch.status})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs px-1.5 py-0.5 bg-gray-800 border border-gray-700/50 rounded text-gray-500 font-mono">
              {repo.branch}
            </span>
          )}
        </div>

        {showBranches && repo.branches.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
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
          <div className="mt-2 flex items-center gap-2">
            <select
              defaultValue=""
              onChange={(event) => {
                if (!event.target.value) return
                onTrackBranch(event.target.value)
                event.currentTarget.value = ''
              }}
              className="min-w-0 max-w-64 px-2 py-1 bg-gray-950/70 border border-gray-700/50 rounded-md text-xs text-gray-300 font-mono focus:outline-none focus:border-indigo-500/70">
              <option value="">Track remote branch...</option>
              {untrackedBranches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-700">{untrackedBranches.length} new</span>
          </div>
        )}

        <div className="flex items-center gap-2.5 mt-1.5">
          {analysisCursor === 'none' ? (
            <span
              className="text-xs px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full"
              title="Run the first analysis to create tests for the current repository state">
              initial analysis needed
            </span>
          ) : analysisCursor === 'active' && hasNew ? (
            <span
              className="text-xs px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full"
              title="New commits appeared after the active test set was created">
              {repo.unanalyzedCount} to add
            </span>
          ) : analysisCursor === 'active' ? (
            <span
              className="text-xs px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-full"
              title="The current commits are already included in the active test set">
              in active analysis
            </span>
          ) : hasNew ? (
            <span className="text-xs px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full">
              {repo.unanalyzedCount} new
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 bg-gray-800/60 text-gray-600 rounded-full">
              up to date
            </span>
          )}
          <span className="text-xs text-gray-700">{formatRelativeTime(repo.lastFetchedAt)}</span>
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={async () => {
            setShowBranches(true)
            await onSyncBranches()
          }}
          disabled={syncingBranches || !repo.githubUrl}
          title="Manage branches"
          className="px-2 py-1.5 text-xs text-gray-500 hover:text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all">
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
          onClick={onDelete}
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
  )
}
