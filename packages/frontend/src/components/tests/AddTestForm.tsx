import { useState } from 'react'
import type { Test } from '../../types/index.ts'

export default function AddTestForm({
  onAdd,
}: {
  onAdd: (data: { description: string; priority: Test['priority']; area: string }) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Test['priority']>('medium')
  const [area, setArea] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) return
    setLoading(true)
    try {
      await onAdd({ description: description.trim(), priority, area: area.trim() })
      setDescription('')
      setArea('')
      setPriority('medium')
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 w-full text-left text-sm text-gray-600 hover:text-gray-400 border border-dashed border-gray-800 hover:border-gray-700 rounded-lg transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Add test manually
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="p-4 bg-gray-900 border border-gray-700/50 rounded-xl space-y-3">
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Test case description..."
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700/50 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
        autoFocus
      />
      <div className="flex gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Test['priority'])}
          className="px-3 py-2 bg-gray-800 border border-gray-700/50 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-indigo-500/50 transition-colors"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder="Area (optional)"
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700/50 rounded-lg text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !description.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Adding...' : 'Add'}
        </button>
      </div>
    </form>
  )
}
