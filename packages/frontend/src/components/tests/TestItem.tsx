import type {Test} from '../../types/index.ts'

const STATUS_CYCLE: Record<Test['status'], Test['status']> = {
  not_tested: 'pass',
  pass: 'fail',
  fail: 'skip',
  skip: 'not_tested',
}

const PRIORITY_STYLES = {
  high: 'text-red-400 bg-red-400/10',
  medium: 'text-amber-400 bg-amber-400/10',
  low: 'text-gray-500 bg-gray-800',
}

const PRIORITY_LABELS = {high: 'high', medium: 'med', low: 'low'}

const STATUS_ICON: Record<Test['status'], React.ReactNode> = {
  not_tested: (
    <span className="w-5 h-5 rounded-md border-2 border-gray-700 flex-shrink-0 transition-colors group-hover:border-gray-500" />
  ),
  pass: (
    <span className="w-5 h-5 rounded-md bg-emerald-500/20 border-2 border-emerald-500 flex-shrink-0 flex items-center justify-center">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path
          d="M1.5 5l2.5 2.5L8.5 2"
          stroke="#10b981"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  ),
  fail: (
    <span className="w-5 h-5 rounded-md bg-red-500/20 border-2 border-red-500 flex-shrink-0 flex items-center justify-center">
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        <path
          d="M1.5 1.5l6 6M7.5 1.5l-6 6"
          stroke="#f87171"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  ),
  skip: (
    <span className="w-5 h-5 rounded-md bg-gray-700/60 border-2 border-gray-600 flex-shrink-0 flex items-center justify-center">
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M1.5 4h5" stroke="#9ca3af" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  ),
}

const STATUS_TEXT: Record<Test['status'], string> = {
  not_tested: 'text-gray-300',
  pass: 'text-emerald-300/70 line-through',
  fail: 'text-red-300',
  skip: 'text-gray-500 line-through',
}

export default function TestItem({
  test,
  onStatusChange,
  onDelete,
}: {
  test: Test
  onStatusChange: (status: Test['status']) => void
  onDelete: () => void
}) {
  const title = test.title || test.description
  const hasStructuredDetails =
    Boolean(test.userScenario) ||
    test.preconditions.length > 0 ||
    test.steps.length > 0 ||
    Boolean(test.expectedResult) ||
    Boolean(test.risk) ||
    Boolean(test.technicalContext)

  return (
    <div className="group flex items-start gap-3 px-4 py-3 rounded-xl border border-transparent hover:border-gray-800/70 hover:bg-gray-900/60 transition-colors">
      <button
        type="button"
        onClick={() => onStatusChange(STATUS_CYCLE[test.status])}
        aria-label="Change test status"
        title="Change status"
        className="-ml-2 -mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-gray-800/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:ring-offset-2 focus:ring-offset-gray-950">
        {STATUS_ICON[test.status]}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium ${PRIORITY_STYLES[test.priority]}`}>
            {PRIORITY_LABELS[test.priority]}
          </span>
          {test.area && (
            <span className="text-xs text-gray-600 bg-gray-800/60 px-1.5 py-0.5 rounded">
              {test.area}
            </span>
          )}
          {test.source === 'manual' && <span className="text-xs text-gray-700">manual</span>}
        </div>
        <p className={`text-sm font-medium leading-snug ${STATUS_TEXT[test.status]}`}>{title}</p>

        {hasStructuredDetails ? (
          <div className={`mt-2 space-y-3 text-sm ${STATUS_TEXT[test.status]}`}>
            {test.userScenario && (
              <p className="leading-relaxed text-gray-400">
                <span className="text-gray-500">Scenario:</span> {test.userScenario}
              </p>
            )}

            {test.preconditions.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Before You Start
                </p>
                <ul className="space-y-1 text-gray-400">
                  {test.preconditions.map((item, index) => (
                    <li key={index} className="flex gap-2">
                      <span className="text-gray-700">-</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {test.steps.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Steps
                </p>
                <ol className="space-y-1 text-gray-300">
                  {test.steps.map((step, index) => (
                    <li key={index} className="flex gap-2">
                      <span className="w-5 flex-shrink-0 text-right text-gray-600">
                        {index + 1}.
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {test.expectedResult && (
              <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2">
                <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-emerald-400/80">
                  Expected Result
                </p>
                <p className="leading-relaxed text-emerald-100/75">{test.expectedResult}</p>
              </div>
            )}

            {test.risk && (
              <p className="leading-relaxed text-amber-300/75">
                <span className="text-amber-400/70">Risk:</span> {test.risk}
              </p>
            )}

            {test.technicalContext && (
              <details className="rounded-lg border border-gray-800/70 bg-gray-950/40 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-gray-600 hover:text-gray-500">
                  Technical Note
                </summary>
                <p className="mt-2 text-xs leading-relaxed text-gray-500">
                  {test.technicalContext}
                </p>
              </details>
            )}
          </div>
        ) : (
          test.title && (
            <p className={`mt-1 text-sm leading-snug ${STATUS_TEXT[test.status]}`}>
              {test.description}
            </p>
          )
        )}
      </div>

      <button
        onClick={onDelete}
        className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 p-1 text-gray-700 hover:text-red-400 hover:bg-red-400/10 rounded transition-all">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path
            d="M1.5 3h8M4.5 3V1.5h2V3M3.5 4v5.5h4V4"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}
