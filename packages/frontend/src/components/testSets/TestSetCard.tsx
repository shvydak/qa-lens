import {useNavigate} from 'react-router-dom'
import type {TestSet} from '../../types/index.ts'

const STATUS_STYLES = {
  active: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
  passed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/15 text-red-400 border-red-500/20',
} as const

const STATUS_LABELS = {
  active: 'In progress',
  passed: 'Passed',
  failed: 'Failed',
} as const

export default function TestSetCard({testSet}: {testSet: TestSet}) {
  const navigate = useNavigate()

  const date = new Date(testSet.createdAt).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <button
      onClick={() => navigate(`/test-sets/${testSet.id}`)}
      className="w-full text-left flex items-start gap-3 p-3.5 bg-gray-900/60 border border-gray-800/40 rounded-xl hover:border-gray-700/60 hover:bg-gray-900 transition-all">
      <div
        className={`flex-shrink-0 mt-0.5 px-2 py-0.5 text-xs border rounded-md ${STATUS_STYLES[testSet.status]}`}>
        {STATUS_LABELS[testSet.status]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono text-gray-300 truncate">{testSet.name}</p>
        <p className="text-xs text-gray-600 mt-0.5">{date}</p>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        className="flex-shrink-0 mt-0.5 text-gray-700">
        <path
          d="M5 3l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
