import {useEffect, useState} from 'react'
import type {Test} from '../../types/index.ts'

export interface AddTestPayload {
  description: string
  priority: Test['priority']
  area: string
  title?: string
  userScenario?: string
  preconditions?: string[]
  steps?: string[]
  expectedResult?: string
  risk?: string
  technicalContext?: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (data: AddTestPayload) => Promise<void>
  initialTest?: Test
}

const linesToArray = (value: string): string[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

const hasAnyStructured = (test: Test): boolean =>
  Boolean(
    test.userScenario ||
    test.preconditions.length > 0 ||
    test.steps.length > 0 ||
    test.expectedResult ||
    test.risk ||
    test.technicalContext
  )

export default function AddTestForm({open, onClose, onSubmit, initialTest}: Props) {
  const isEdit = Boolean(initialTest)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Test['priority']>('medium')
  const [area, setArea] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  const [userScenario, setUserScenario] = useState('')
  const [preconditions, setPreconditions] = useState('')
  const [steps, setSteps] = useState('')
  const [expectedResult, setExpectedResult] = useState('')
  const [risk, setRisk] = useState('')
  const [technicalContext, setTechnicalContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (initialTest) {
      setTitle(initialTest.title || initialTest.description)
      setPriority(initialTest.priority)
      setArea(initialTest.area ?? '')
      setUserScenario(initialTest.userScenario ?? '')
      setPreconditions(initialTest.preconditions.join('\n'))
      setSteps(initialTest.steps.join('\n'))
      setExpectedResult(initialTest.expectedResult ?? '')
      setRisk(initialTest.risk ?? '')
      setTechnicalContext(initialTest.technicalContext ?? '')
      setShowDetails(hasAnyStructured(initialTest))
    } else {
      setTitle('')
      setPriority('medium')
      setArea('')
      setUserScenario('')
      setPreconditions('')
      setSteps('')
      setExpectedResult('')
      setRisk('')
      setTechnicalContext('')
      setShowDetails(false)
    }
    setError(null)
  }, [open, initialTest])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    document.addEventListener('keydown', handleKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, loading, onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const titleTrimmed = title.trim()
    if (!titleTrimmed) return
    setLoading(true)
    setError(null)
    try {
      const payload: AddTestPayload = {
        description: titleTrimmed,
        title: '',
        priority,
        area: area.trim(),
      }
      if (isEdit || showDetails) {
        const s = userScenario.trim()
        const er = expectedResult.trim()
        const r = risk.trim()
        const tc = technicalContext.trim()
        const pre = linesToArray(preconditions)
        const st = linesToArray(steps)
        payload.userScenario = s
        payload.preconditions = pre
        payload.steps = st
        payload.expectedResult = er
        payload.risk = r
        payload.technicalContext = tc
      }
      await onSubmit(payload)
      onClose()
    } catch {
      setError(isEdit ? 'Failed to save changes' : 'Failed to add test')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  const headerTitle = isEdit ? 'Edit test case' : 'Add test case'
  const submitIdle = isEdit ? 'Save changes' : 'Add test'
  const submitBusy = isEdit ? 'Saving...' : 'Adding...'

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm px-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}>
      <div className="w-full max-w-2xl rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800/70 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-gray-200">{headerTitle}</h2>
          <button
            type="button"
            onClick={() => !loading && onClose()}
            className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-800/60 hover:text-gray-300"
            aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3.5 3.5l9 9M12.5 3.5l-9 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Title <span className="text-red-400/80">*</span>
            </label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What should be tested?"
              rows={2}
              autoFocus
              className="w-full resize-none rounded-lg border border-gray-700/50 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 transition-colors focus:border-indigo-500/50 focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <div className="w-32">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Test['priority'])}
                className="w-full rounded-lg border border-gray-700/50 bg-gray-900 px-3 py-2 text-sm text-gray-300 transition-colors focus:border-indigo-500/50 focus:outline-none">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Area
              </label>
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Optional (e.g. Auth, Billing)"
                className="w-full rounded-lg border border-gray-700/50 bg-gray-900 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 transition-colors focus:border-indigo-500/50 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-300">
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              className={`transition-transform ${showDetails ? 'rotate-90' : ''}`}>
              <path d="M3 1.5L6.5 5L3 8.5" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            {showDetails
              ? 'Hide structured details'
              : 'Add structured details (scenario, steps...)'}
          </button>

          {showDetails && (
            <div className="space-y-4 rounded-xl border border-gray-800/70 bg-gray-900/40 p-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  User scenario
                </label>
                <textarea
                  value={userScenario}
                  onChange={(e) => setUserScenario(e.target.value)}
                  placeholder="Describe the end-user flow this test covers"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-gray-700/50 bg-gray-900 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 transition-colors focus:border-indigo-500/50 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Preconditions
                  </label>
                  <textarea
                    value={preconditions}
                    onChange={(e) => setPreconditions(e.target.value)}
                    placeholder={'One per line, e.g.\nUser is logged in\nBilling enabled'}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-gray-700/50 bg-gray-900 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 transition-colors focus:border-indigo-500/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Steps
                  </label>
                  <textarea
                    value={steps}
                    onChange={(e) => setSteps(e.target.value)}
                    placeholder={'One per line, e.g.\nOpen settings\nClick Reset\nConfirm dialog'}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-gray-700/50 bg-gray-900 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 transition-colors focus:border-indigo-500/50 focus:invoke-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Expected result
                </label>
                <textarea
                  value={expectedResult}
                  onChange={(e) => setExpectedResult(e.target.value)}
                  placeholder="What should happen if the test passes"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-gray-700/50 bg-gray-900 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 transition-colors focus:border-indigo-500/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Risk
                </label>
                <textarea
                  value={risk}
                  onChange={(e) => setRisk(e.target.value)}
                  placeholder="What breaks if this regresses"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-gray-700/50 bg-gray-900 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 transition-colors focus:border-indigo-500/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Technical note
                </label>
                <textarea
                  value={technicalContext}
                  onChange={(e) => setTechnicalContext(e.target.value)}
                  placeholder="Internal hint for the engineer / QA"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-gray-700/50 bg-gray-900 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 transition-colors focus:border-indigo-500/50 focus:outline-none"
                />
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-gray-800/70 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-700 disabled:opacity-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
              {loading ? submitBusy : submitIdle}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
