import {useState} from 'react'
import type {TestSet} from '../../types/index.ts'

export default function TestSetInsights({testSet}: {testSet: TestSet}) {
  const [aiExpanded, setAiExpanded] = useState(false)
  const [regressionsOpen, setRegressionsOpen] = useState(false)
  const [crossImpactsOpen, setCrossImpactsOpen] = useState(false)

  return (
    <>
      {testSet.commitTargets && testSet.commitTargets.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {testSet.commitTargets.map((target) => (
            <div
              key={target.id}
              title={`${target.repositoryPath}\n${(target.from ?? 'start').slice(0, 7)}..${target.to.slice(0, 7)}`}
              className="inline-flex items-center gap-1.5 bg-gray-900 border border-gray-800/60 rounded-lg px-2.5 py-1 text-xs">
              <span className="text-gray-400">{target.repositoryName}</span>
              <span className="text-gray-700">/</span>
              <span className="font-mono text-indigo-300">{target.branchName}</span>
            </div>
          ))}
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
          <p
            className={`text-sm text-gray-300 leading-relaxed ${aiExpanded ? '' : 'line-clamp-3'}`}>
            {testSet.aiSummary}
          </p>
          {testSet.aiSummary.length > 200 && (
            <button
              onClick={() => setAiExpanded((v) => !v)}
              className="mt-1.5 text-xs text-indigo-400/70 hover:text-indigo-300 transition-colors">
              {aiExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {testSet.regressions?.length > 0 && (
        <div className="mb-4 border border-amber-500/15 rounded-xl overflow-hidden">
          <button
            onClick={() => setRegressionsOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 bg-amber-500/5 hover:bg-amber-500/10 transition-colors">
            <svg
              width="13"
              height="13"
              viewBox="0 0 13 13"
              fill="none"
              className="text-amber-400 flex-shrink-0">
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
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex-1 text-left">
              Possible Regressions
            </span>
            <span className="text-xs text-amber-500/70 mr-1">{testSet.regressions.length}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className={`text-amber-500/50 transition-transform ${regressionsOpen ? 'rotate-180' : ''}`}>
              <path
                d="M2 4l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {regressionsOpen && (
            <ul className="px-4 py-3 space-y-1.5 bg-amber-500/5">
              {testSet.regressions.map((r, i) => (
                <li key={i} className="text-sm text-amber-300/80 flex items-start gap-2">
                  <span className="text-amber-600 mt-1 flex-shrink-0">·</span>
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {testSet.crossImpacts?.length > 0 && (
        <div className="mb-6 border border-blue-500/15 rounded-xl overflow-hidden">
          <button
            onClick={() => setCrossImpactsOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
            <svg
              width="13"
              height="13"
              viewBox="0 0 13 13"
              fill="none"
              className="text-blue-400 flex-shrink-0">
              <path
                d="M1.5 6.5h10M6.5 1.5v10"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider flex-1 text-left">
              Cross-repo Impact
            </span>
            <span className="text-xs text-blue-500/70 mr-1">{testSet.crossImpacts.length}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className={`text-blue-500/50 transition-transform ${crossImpactsOpen ? 'rotate-180' : ''}`}>
              <path
                d="M2 4l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {crossImpactsOpen && (
            <ul className="px-4 py-3 space-y-1.5 bg-blue-500/5">
              {testSet.crossImpacts.map((c, i) => (
                <li key={i} className="text-sm text-blue-300/80 flex items-start gap-2">
                  <span className="text-blue-600 mt-1 flex-shrink-0">·</span>
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}
