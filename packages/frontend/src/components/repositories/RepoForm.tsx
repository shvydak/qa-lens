import { useState } from 'react'
import { apiFetch } from '../../api/client.ts'
import type { Repository } from '../../types/index.ts'

export default function RepoForm({
  projectId,
  onClose,
  onAdd,
}: {
  projectId: string
  onClose: () => void
  onAdd: (repo: Repository) => void
}) {
  const [localPath, setLocalPath] = useState('')
  const [branch, setBranch] = useState('main')
  const [githubUrl, setGithubUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')

  const pickFolder = async () => {
    setPicking(true)
    try {
      const result = await apiFetch<{ path: string | null }>('GET', '/api/utils/pick-folder')
      if (result.path) setLocalPath(result.path)
    } catch {
      // ignore
    } finally {
      setPicking(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!localPath.trim()) return
    setLoading(true)
    setError('')
    try {
      const repo = await apiFetch<Repository>('POST', `/api/projects/${projectId}/repos`, {
        localPath: localPath.trim(),
        branch: branch.trim() || 'main',
        githubUrl: githubUrl.trim() || undefined,
      })
      onAdd(repo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-800/60">
          <h2 className="font-semibold text-gray-100">Add Repository</h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Local path *</label>
            <div className="flex gap-2">
              <input
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="/Users/me/projects/probuild-api"
                className="flex-1 min-w-0 px-3 py-2.5 bg-gray-800 border border-gray-700/50 rounded-lg text-gray-100 placeholder-gray-600 text-sm font-mono focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
                autoFocus
              />
              <button
                type="button"
                onClick={pickFolder}
                disabled={picking}
                title="Browse for folder"
                className="flex-shrink-0 flex items-center justify-center w-10 h-10 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700/50 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
              >
                {picking ? (
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="8 8" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <path d="M1.5 4.5A1 1 0 012.5 3.5h3l1.5 1.5H12.5a1 1 0 011 1v5a1 1 0 01-1 1h-10a1 1 0 01-1-1v-6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Branch</label>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700/50 rounded-lg text-gray-100 placeholder-gray-600 text-sm font-mono focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              GitHub URL
              <span className="text-gray-600 font-normal ml-1">(optional)</span>
            </label>
            <input
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/org/repo"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700/50 rounded-lg text-gray-100 placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
            />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !localPath.trim()}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
