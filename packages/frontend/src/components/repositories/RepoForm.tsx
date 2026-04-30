import {useState} from 'react'
import {apiFetch} from '../../api/client.ts'
import type {RemoteBranch, Repository} from '../../types/index.ts'

export default function RepoForm({
  projectId,
  onClose,
  onAdd,
}: {
  projectId: string
  onClose: () => void
  onAdd: (repo: Repository) => void
}) {
  const [githubUrl, setGithubUrl] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [branches, setBranches] = useState<RemoteBranch[]>([])
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set())
  const [discovering, setDiscovering] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const discoverBranches = async () => {
    if (!githubUrl.trim()) return
    setDiscovering(true)
    setError('')
    try {
      const result = await apiFetch<{branches: RemoteBranch[]}>(
        'POST',
        `/api/projects/${projectId}/repos/discover-branches`,
        {githubUrl: githubUrl.trim(), githubToken: githubToken.trim() || undefined}
      )
      setBranches(result.branches)
      const defaultBranch =
        result.branches.find((branch) => branch.name === 'staging') ?? result.branches[0]
      setSelectedBranches(defaultBranch ? new Set([defaultBranch.name]) : new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover branches')
    } finally {
      setDiscovering(false)
    }
  }

  const toggleBranch = (name: string) => {
    setSelectedBranches((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!githubUrl.trim() || selectedBranches.size === 0) return
    setLoading(true)
    setError('')
    try {
      const repo = await apiFetch<Repository>('POST', `/api/projects/${projectId}/repos`, {
        githubUrl: githubUrl.trim(),
        githubToken: githubToken.trim() || undefined,
        branchNames: Array.from(selectedBranches),
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
      <div className="w-full max-w-xl bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-800/60">
          <div>
            <h2 className="font-semibold text-gray-100">Connect Repository</h2>
            <p className="text-xs text-gray-500 mt-1">
              QA Lens only reads from GitHub and stores its own managed clone.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-300 transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 2l12 12M14 2L2 14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">GitHub URL *</label>
            <div className="flex gap-2">
              <input
                value={githubUrl}
                onChange={(e) => {
                  setGithubUrl(e.target.value)
                  setBranches([])
                  setSelectedBranches(new Set())
                }}
                placeholder="https://github.com/org/repo"
                className="flex-1 min-w-0 px-3 py-2.5 bg-gray-800 border border-gray-700/50 rounded-lg text-gray-100 placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
                autoFocus
              />
              <button
                type="button"
                onClick={discoverBranches}
                disabled={discovering || !githubUrl.trim()}
                className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700/50 rounded-lg text-gray-300 text-sm transition-colors">
                {discovering ? 'Checking...' : 'Discover'}
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="block text-xs font-medium text-gray-400">
                GitHub token
                <span className="text-gray-600 font-normal ml-1">(optional, read-only)</span>
              </label>
              <div className="relative group">
                <button
                  type="button"
                  aria-label="What is a GitHub token?"
                  className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-700 text-[10px] text-gray-500 hover:border-indigo-500/60 hover:text-indigo-300 transition-colors">
                  ?
                </button>
                <div className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-72 -translate-x-1/2 rounded-xl border border-gray-700/70 bg-gray-950 p-3 text-xs leading-relaxed text-gray-400 shadow-2xl group-hover:block">
                  A GitHub Personal Access Token lets QA Lens read private repositories. Create a
                  fine-grained token in GitHub Settings → Developer settings → Personal access
                  tokens, and grant read-only access to the repository contents. QA Lens uses it
                  only for branch discovery, clone, and fetch.
                </div>
              </div>
            </div>
            <input
              type="password"
              value={githubToken}
              onChange={(e) => {
                setGithubToken(e.target.value)
                setBranches([])
                setSelectedBranches(new Set())
              }}
              placeholder="Fine-grained token with repository read access"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700/50 rounded-lg text-gray-100 placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
            />
            <p className="mt-1.5 text-xs text-gray-600">
              Stored locally for future fetches. QA Lens uses it only for read-only Git operations.
            </p>
          </div>

          {branches.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-gray-400">Branches to track</label>
                <span className="text-xs text-gray-600">{selectedBranches.size} selected</span>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-800/80 bg-gray-950/40 p-2 space-y-1">
                {branches.map((branch) => {
                  const checked = selectedBranches.has(branch.name)
                  return (
                    <button
                      type="button"
                      key={branch.name}
                      onClick={() => toggleBranch(branch.name)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                        checked
                          ? 'bg-indigo-500/10 text-indigo-200 border border-indigo-500/20'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-transparent'
                      }`}>
                      <span className="font-mono text-xs truncate">{branch.name}</span>
                      <span className="text-[10px] text-gray-600 font-mono">
                        {branch.commitHash.slice(0, 7)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !githubUrl.trim() || selectedBranches.size === 0}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
              {loading ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
