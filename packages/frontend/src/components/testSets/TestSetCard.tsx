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

interface TestSetCardProps {
  testSet: TestSet
  showTargets?: boolean
}

export default function TestSetCard({testSet, showTargets = true}: TestSetCardProps) {
  const navigate = useNavigate()

  const latestDate = testSet.latestAnalysisRunAt ?? testSet.createdAt
  const date = new Date(latestDate).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  const rangeSummary = getRangeSummary(testSet)
  const targetSummary = getTargetSummary(testSet)
  const updateCount = testSet.analysisRunCount ?? testSet.analysisRuns?.length ?? 0
  const updateLabel =
    updateCount > 1
      ? `${updateCount} analysis updates`
      : updateCount === 1
        ? '1 analysis run'
        : null

  return (
    <button
      onClick={() => navigate(`/test-sets/${testSet.id}`)}
      title={rangeSummary}
      className="w-full text-left group p-3.5 bg-gray-900/60 border border-gray-800/40 rounded-xl hover:border-gray-700/70 hover:bg-gray-900 transition-all">
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 mt-0.5 px-2 py-0.5 text-xs border rounded-md ${STATUS_STYLES[testSet.status]}`}>
          {STATUS_LABELS[testSet.status]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-300 truncate">
            {targetSummary || testSet.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
            {updateLabel && <span>{updateLabel}</span>}
            <span>{date}</span>
          </div>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="flex-shrink-0 mt-0.5 text-gray-700 group-hover:text-gray-500 transition-colors">
          <path
            d="M5 3l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {showTargets && testSet.commitTargets && testSet.commitTargets.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {testSet.commitTargets.slice(0, 3).map((target) => (
            <span
              key={target.id}
              title={`${target.repositoryPath}: ${target.from ?? 'start'}..${target.to}`}
              className="max-w-full rounded-md border border-gray-800 bg-gray-950/50 px-2 py-1 text-xs text-gray-400">
              <span className="text-gray-500">{repoLabel(target.repositoryPath)}</span>
              <span className="mx-1 text-gray-700">/</span>
              <span className="font-mono text-indigo-300">{target.branchName}</span>
            </span>
          ))}
          {testSet.commitTargets.length > 3 && (
            <span className="rounded-md border border-gray-800 bg-gray-950/50 px-2 py-1 text-xs text-gray-500">
              +{testSet.commitTargets.length - 3} more
            </span>
          )}
        </div>
      )}
    </button>
  )
}

function getTargetSummary(testSet: TestSet): string {
  const targets = testSet.commitTargets ?? []
  if (targets.length === 0) return ''

  if (targets.length === 1) {
    const [target] = targets
    return `Analysis for ${target.branchName}`
  }

  return `${targets.length} branches analyzed`
}

function getRangeSummary(testSet: TestSet): string {
  const targets = testSet.commitTargets ?? []
  if (targets.length === 0) return testSet.name

  return targets
    .map(
      (target) =>
        `${target.branchName}: ${shortHash(target.from) ?? 'start'}..${shortHash(target.to)}`
    )
    .join(' · ')
}

function shortHash(hash: string | null): string | null {
  return hash ? hash.slice(0, 7) : null
}

function repoLabel(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}
