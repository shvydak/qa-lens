import type { AnalysisStatus } from '../../types/index.ts'

export default function AnalysisPanel({
  status,
  onAnalyze,
}: {
  status: AnalysisStatus
  onAnalyze: () => void
}) {
  const isNoNewCommits = status.error === 'no_new_commits'

  return (
    <div className="bg-gray-900 border border-gray-800/50 rounded-xl p-5">
      {status.running ? (
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin-slow flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-200">Analyzing changes...</p>
            <p className="text-xs text-gray-500 mt-0.5">AI is reviewing commits and cross-repo relationships</p>
          </div>
        </div>
      ) : (
        <>
          {status.error && !isNoNewCommits && (
            <div className="mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-xs font-medium text-red-400 mb-0.5">Analysis failed</p>
              <p className="text-xs text-red-400/70">{status.error}</p>
            </div>
          )}

          {isNoNewCommits && (
            <div className="mb-4 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                <path d="M2 7l3.5 3.5L12 3.5" stroke="#10b981" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-xs text-emerald-400">All commits have already been analyzed</p>
            </div>
          )}

          <button
            onClick={onAnalyze}
            className="w-full flex items-center justify-center gap-2.5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-lg transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.3" />
              <path d="M5 7.5h5M7.5 5v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M4 4.5A4.5 4.5 0 0 1 11.5 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
            </svg>
            Run Analysis
          </button>
          <p className="text-xs text-gray-600 text-center mt-2">
            AI will analyze all new commits across all repositories
          </p>
        </>
      )}
    </div>
  )
}
