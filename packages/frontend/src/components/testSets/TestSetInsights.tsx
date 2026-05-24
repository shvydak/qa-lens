import type {TestSet} from '../../types/index.ts'

/**
 * Read-only summary panels for a test set: analyzed branch ranges, the AI
 * summary, possible regressions, and cross-repo impacts.
 */
export default function TestSetInsights({testSet}: {testSet: TestSet}) {
  return (
    <>
      {testSet.commitTargets && testSet.commitTargets.length > 0 && (
        <div className="mb-4 p-4 bg-gray-900 border border-gray-800/50 rounded-xl">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Analyzed branches
          </div>
          <div className="space-y-2">
            {testSet.commitTargets.map((target) => (
              <div
                key={target.id}
                className="flex items-center justify-between gap-3 text-xs bg-gray-950/40 border border-gray-800/60 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="font-mono text-gray-300 truncate">{target.repositoryPath}</div>
                  <div className="font-mono text-indigo-300 mt-0.5">{target.branchName}</div>
                </div>
                <div className="flex-shrink-0 font-mono text-gray-500">
                  {(target.from ?? 'start').slice(0, 7)}..{target.to.slice(0, 7)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {testSet.aiSummary && (
        <div className="mb-4 p-4 bg-gray-900 border border-gray-800/50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-indigo-400">
              <path
                d="M6.5 1L8 5h4L9 7.5l1 4-3.5-2L3 11.5l1-4L1 5h4z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              AI Analysis
            </span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">{testSet.aiSummary}</p>
        </div>
      )}

      {testSet.regressions?.length > 0 && (
        <div className="mb-4 p-4 bg-amber-500/5 border border-amber-500/15 rounded-xl">
          <div className="flex items-center gap-2 mb-2.5">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-amber-400">
              <path
                d="M6.5 1.5L12 11.5H1L6.5 1.5z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <path
                d="M6.5 5v3M6.5 9.5v.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              Possible Regressions
            </span>
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
              <path
                d="M1.5 6.5h10M6.5 1.5v10"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
              Cross-repo Impact
            </span>
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
    </>
  )
}
