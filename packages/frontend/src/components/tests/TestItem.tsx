import {useState, useEffect, useRef} from 'react'
import type {Test, TestAttachment} from '../../types/index.ts'
import {API_BASE} from '../../api/client.ts'

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

const AREA_BADGE_STYLES = [
  'border-sky-400/20 bg-sky-400/10 text-sky-300',
  'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
  'border-indigo-400/20 bg-indigo-400/10 text-indigo-300',
  'border-violet-400/20 bg-violet-400/10 text-violet-300',
  'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-300',
  'border-rose-400/20 bg-rose-400/10 text-rose-300',
  'border-orange-400/20 bg-orange-400/10 text-orange-300',
  'border-lime-400/20 bg-lime-400/10 text-lime-300',
  'border-teal-400/20 bg-teal-400/10 text-teal-300',
]

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

/** Title / secondary description only — no line-through (it made long scenarios unreadable). */
const STATUS_TITLE: Record<Test['status'], string> = {
  not_tested: 'text-gray-100',
  pass: 'text-emerald-100',
  fail: 'text-red-100',
  skip: 'text-gray-400',
}

const STATUS_CARD: Record<Test['status'], string> = {
  not_tested: 'border-transparent hover:border-gray-800/70 hover:bg-gray-900/60',
  pass: 'border-emerald-500/25 bg-emerald-950/35 hover:border-emerald-500/35 hover:bg-emerald-950/45',
  fail: 'border-red-500/25 bg-red-950/35 hover:border-red-500/35 hover:bg-red-950/45',
  skip: 'border-gray-700/40 bg-gray-900/50 hover:border-gray-600/55 hover:bg-gray-900/65',
}

const NOTE_MAX = 500

export default function TestItem({
  test,
  onStatusChange,
  onDelete,
  onNoteChange,
  onAttachmentUpload,
  onAttachmentDelete,
  metadata,
}: {
  test: Test
  onStatusChange: (status: Test['status']) => void
  onDelete: () => void
  onNoteChange: (note: string | null) => Promise<void>
  onAttachmentUpload: (file: File) => Promise<void>
  onAttachmentDelete: (attachmentId: string) => Promise<void>
  metadata?: string
}) {
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [draftNote, setDraftNote] = useState(test.note ?? '')
  const [savingNote, setSavingNote] = useState(false)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isEditingNote) setDraftNote(test.note ?? '')
  }, [test.note, isEditingNote])

  const handleSaveNote = async () => {
    setSavingNote(true)
    setNoteError(null)
    try {
      await onNoteChange(draftNote.trim() || null)
      setIsEditingNote(false)
    } catch {
      setNoteError('Failed to save note')
    } finally {
      setSavingNote(false)
    }
  }

  const handleCancelNote = () => {
    setDraftNote(test.note ?? '')
    setNoteError(null)
    setIsEditingNote(false)
  }

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setNoteError('Only image files are supported')
      return
    }
    setUploadingCount((n) => n + 1)
    setNoteError(null)
    try {
      await onAttachmentUpload(file)
    } catch {
      setNoteError('Failed to upload image')
    } finally {
      setUploadingCount((n) => n - 1)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    for (const file of Array.from(e.target.files ?? [])) {
      await uploadFile(file)
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(e.clipboardData.items).find((item) =>
      item.type.startsWith('image/')
    )
    if (!imageItem) return
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (file) uploadFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      setIsDragging(true)
    }
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    for (const file of Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('image/')
    )) {
      await uploadFile(file)
    }
  }

  const handleDeleteAttachment = async (att: TestAttachment) => {
    try {
      await onAttachmentDelete(att.id)
    } catch {
      setNoteError('Failed to remove image')
    }
  }

  const attachmentUrl = (att: TestAttachment) => `${API_BASE}/uploads/${att.filename}`
  const isUploading = uploadingCount > 0
  const charsLeft = NOTE_MAX - draftNote.length
  const nearLimit = charsLeft < 100

  const title = test.title || test.description
  const hasStructuredDetails =
    Boolean(test.userScenario) ||
    test.preconditions.length > 0 ||
    test.steps.length > 0 ||
    Boolean(test.expectedResult) ||
    Boolean(test.risk) ||
    Boolean(test.technicalContext)

  return (
    <div
      className={`group flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors ${STATUS_CARD[test.status]}`}>
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
            <span
              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${getAreaBadgeStyle(test.area)}`}>
              {test.area}
            </span>
          )}
          {test.source === 'manual' && <span className="text-xs text-gray-700">manual</span>}
          {metadata && <span className="text-xs text-gray-600">{metadata}</span>}
        </div>
        <p className={`text-sm font-medium leading-snug ${STATUS_TITLE[test.status]}`}>{title}</p>

        {hasStructuredDetails ? (
          <div className="mt-2 space-y-3 text-sm">
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
            <p className={`mt-1 text-sm leading-snug ${STATUS_TITLE[test.status]}`}>
              {test.description}
            </p>
          )
        )}

        {/* Note + screenshot section */}
        {isEditingNote ? (
          <div className="mt-3 space-y-2">
            {/* Drop zone wrapping textarea */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative rounded-lg border transition-colors ${
                isDragging
                  ? 'border-indigo-500/60 bg-indigo-500/5'
                  : 'border-gray-700/50 bg-gray-800'
              }`}>
              <textarea
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                onPaste={handlePaste}
                placeholder="Add a note... paste or drop screenshots here"
                maxLength={NOTE_MAX}
                rows={3}
                autoFocus
                className="w-full resize-none bg-transparent px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
              />
              {isDragging && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg">
                  <span className="text-xs font-medium text-indigo-400">Drop images to attach</span>
                </div>
              )}
              {isUploading && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-gray-800/60">
                  <span className="text-xs text-gray-400">Uploading...</span>
                </div>
              )}
            </div>

            {/* Attachment thumbnails */}
            {test.attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {test.attachments.map((att) => (
                  <div key={att.id} className="group/att relative">
                    <a href={attachmentUrl(att)} target="_blank" rel="noopener noreferrer">
                      <img
                        src={attachmentUrl(att)}
                        alt="Attachment"
                        className="h-14 w-auto rounded border border-gray-700/50 object-cover hover:border-gray-500/50 transition-colors"
                      />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDeleteAttachment(att)}
                      title="Remove"
                      className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full border border-gray-600 bg-gray-900 text-[10px] text-gray-400 hover:border-red-500/50 hover:text-red-400 group-hover/att:flex transition-colors">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload row */}
            <label className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <rect
                  x="1"
                  y="2.5"
                  width="9"
                  height="7"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <circle cx="5.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path
                  d="M3.5 2.5V2a1 1 0 011-1h2a1 1 0 011 1v.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
              {isUploading
                ? 'Uploading...'
                : test.attachments.length > 0
                  ? 'Add more'
                  : 'Attach screenshot'}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
                disabled={isUploading}
              />
            </label>

            {/* Actions row */}
            <div className="flex items-center justify-between gap-2">
              {noteError ? (
                <span className="text-xs text-red-400">{noteError}</span>
              ) : nearLimit ? (
                <span
                  className={`text-[11px] tabular-nums ${charsLeft < 20 ? 'text-red-400' : 'text-amber-500/70'}`}>
                  {charsLeft} chars left
                </span>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCancelNote}
                  disabled={savingNote}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition-colors">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  disabled={savingNote}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium transition-colors">
                  {savingNote ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : test.note || test.attachments.length > 0 ? (
          /* Display mode: has note or attachments */
          <div
            className="group/note mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-800/60 bg-gray-900/40 px-3 py-2 hover:border-gray-700/60 hover:bg-gray-900/60 transition-colors"
            onClick={() => setIsEditingNote(true)}>
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              className="mt-0.5 flex-shrink-0 text-gray-700">
              <path
                d="M6.5 1.5L8.5 3.5L3 9H1V7L6.5 1.5Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {test.note && (
                <p className="text-xs leading-relaxed text-gray-500 group-hover/note:text-gray-400 whitespace-pre-wrap transition-colors">
                  {test.note}
                </p>
              )}
              {test.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {test.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={attachmentUrl(att)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}>
                      <img
                        src={attachmentUrl(att)}
                        alt="Attachment"
                        className="h-10 w-auto rounded border border-gray-700/50 object-cover hover:border-gray-500/50 transition-colors"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Empty trigger — shown on hover, red-tinted for failed tests */
          <button
            type="button"
            onClick={() => setIsEditingNote(true)}
            className={`mt-2 flex items-center gap-1 text-xs opacity-0 group-hover:opacity-100 transition-all ${
              test.status === 'fail'
                ? 'text-red-400/50 hover:text-red-400/80'
                : 'text-gray-700 hover:text-gray-500'
            }`}>
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path
                d="M5.5 1.5L7.5 3.5L2 9H0V7L5.5 1.5Z"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
            </svg>
            Add note
          </button>
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

export function getAreaBadgeStyle(area: string): string {
  return AREA_BADGE_STYLES[getStableIndex(area, AREA_BADGE_STYLES.length)]
}

function getStableIndex(value: string, size: number): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash % size
}
