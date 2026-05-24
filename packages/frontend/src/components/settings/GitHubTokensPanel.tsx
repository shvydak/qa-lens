import {useEffect, useState} from 'react'
import {apiFetch} from '../../api/client.ts'
import type {GitHubCredential} from '../../types/index.ts'

export default function GitHubTokensPanel() {
  const [credentials, setCredentials] = useState<GitHubCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch<GitHubCredential[]>('GET', '/api/settings/credentials')
      .then(setCredentials)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load tokens'))
      .finally(() => setLoading(false))
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !token.trim()) return
    setSaving(true)
    setError('')
    try {
      const created = await apiFetch<GitHubCredential>('POST', '/api/settings/credentials', {
        name: name.trim(),
        token: token.trim(),
      })
      setCredentials((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      setToken('')
      setAdding(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save token')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (credential: GitHubCredential) => {
    if (!window.confirm(`Delete the global token "${credential.name}"?`)) return
    try {
      await apiFetch('DELETE', `/api/settings/credentials/${credential.id}`)
      setCredentials((prev) => prev.filter((c) => c.id !== credential.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete token')
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-xs font-medium text-gray-400">Global GitHub tokens</p>
          <p className="text-xs text-gray-600 leading-relaxed mt-1 max-w-md">
            Save read-only tokens once and reuse them when adding repositories to any project.
            Tokens are stored locally and never returned by the API.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M5.5 1v9M1 5.5h9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            Add token
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={submit}
          className="mb-5 p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1.5">Label</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme org read-only"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700/50 rounded-lg text-gray-100 placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1.5">
              Personal access token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_… or fine-grained token"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700/50 rounded-lg text-gray-100 placeholder-gray-600 text-sm font-mono focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
            />
            <p className="mt-1.5 text-[11px] text-gray-600">
              Grant repository contents read access. QA Lens never pushes or writes.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setName('')
                setToken('')
                setError('')
              }}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !token.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors">
              {saving ? 'Saving…' : 'Save token'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="mb-4 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-gray-800/40 animate-pulse" />
          ))}
        </div>
      ) : credentials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-gray-800 rounded-xl">
          <div className="w-10 h-10 rounded-xl bg-gray-800/60 flex items-center justify-center mb-3 text-gray-600">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect
                x="3"
                y="8"
                width="12"
                height="7.5"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M5.75 8V5.5a3.25 3.25 0 016.5 0V8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-400 font-medium">No global tokens yet</p>
          <p className="text-xs text-gray-600 mt-1 max-w-xs">
            Add a token here once and pick it from any project's repo form.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {credentials.map((c) => (
            <li
              key={c.id}
              className="group flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-950/40 border border-gray-800/60 hover:border-gray-700/70 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-gray-800/80 flex items-center justify-center text-gray-500 flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect
                    x="2"
                    y="6.5"
                    width="10"
                    height="6"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  <path
                    d="M4.5 6.5V4a2.5 2.5 0 015 0v2.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 font-medium truncate">{c.name}</p>
                <p className="text-[11px] text-gray-600 mt-0.5 font-mono">
                  •••••••••••• · added {formatDate(c.createdAt)}
                </p>
              </div>
              <button
                onClick={() => remove(c)}
                aria-label={`Delete ${c.name}`}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path
                    d="M2 2l9 9M11 2l-9 9"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
}
