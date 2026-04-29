import type {Repository} from '../../types/index.ts'

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
}: {
  repo: Repository
  onDelete: () => void
  onFetch: () => Promise<void>
}) {
  const hasNew = (repo.unanalyzedCount ?? 0) > 0

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
          <span className="flex-shrink-0 text-xs px-1.5 py-0.5 bg-gray-800 border border-gray-700/50 rounded text-gray-500 font-mono">
            {repo.branch}
          </span>
        </div>

        <div className="flex items-center gap-2.5 mt-1.5">
          {hasNew ? (
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
          onClick={onFetch}
          title="Fetch"
          className="p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-all">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path
              d="M6.5 1.5A5 5 0 1 1 2 9"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M1 6.5V9.5H4"
              stroke="currentColor"
              strokeWidth="1.4"
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
