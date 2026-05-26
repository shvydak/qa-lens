import {useEffect, useId, useRef} from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    cancelRef.current?.focus()

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onCancel])

  if (!open) return null

  const confirmClass =
    variant === 'danger'
      ? 'bg-red-500/15 border-red-500/30 text-red-300 hover:bg-red-500/25 hover:border-red-500/45 hover:text-red-200'
      : 'bg-indigo-600 border-transparent text-white hover:bg-indigo-500'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
        <div className="px-5 py-4">
          <h2 id={titleId} className="text-sm font-semibold text-gray-100">
            {title}
          </h2>
          {description && (
            <div id={descriptionId} className="mt-2 text-sm leading-relaxed text-gray-400">
              {description}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-800/70 px-5 py-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-700 hover:bg-gray-800 hover:text-gray-200">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${confirmClass}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
