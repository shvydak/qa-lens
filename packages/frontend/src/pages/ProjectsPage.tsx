import {useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import {apiFetch} from '../api/client.ts'
import type {Project} from '../types/index.ts'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const navigate = useNavigate()

  const load = async () => {
    try {
      const data = await apiFetch<Project[]>('GET', '/api/projects')
      setProjects(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete project? This action cannot be undone.')) return
    await apiFetch('DELETE', `/api/projects/${id}`)
    setProjects((p) => p.filter((x) => x.id !== id))
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Projects</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage QA analysis across projects</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          New Project
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-40 bg-gray-900 rounded-xl animate-pulse border border-gray-800/50"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-900 border border-gray-800/50 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect
                x="2"
                y="2"
                width="10"
                height="10"
                rx="2.5"
                stroke="#4b5563"
                strokeWidth="1.5"
              />
              <rect
                x="16"
                y="2"
                width="10"
                height="10"
                rx="2.5"
                stroke="#4b5563"
                strokeWidth="1.5"
              />
              <rect
                x="2"
                y="16"
                width="10"
                height="10"
                rx="2.5"
                stroke="#4b5563"
                strokeWidth="1.5"
              />
              <rect
                x="16"
                y="16"
                width="10"
                height="10"
                rx="2.5"
                stroke="#4b5563"
                strokeWidth="1.5"
              />
            </svg>
          </div>
          <p className="text-gray-400 font-medium">No projects yet</p>
          <p className="text-gray-600 text-sm mt-1">Create your first project to get started</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
            Create project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={() => navigate(`/projects/${p.id}`)}
              onDelete={(e) => deleteProject(p.id, e)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <ProjectModal
          onClose={() => setShowForm(false)}
          onCreate={(p) => {
            setProjects((prev) => [p, ...prev])
            setShowForm(false)
            navigate(`/projects/${p.id}`)
          }}
        />
      )}
    </div>
  )
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: Project
  onOpen: () => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const date = new Date(project.createdAt).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div
      onClick={onOpen}
      className="group relative flex flex-col p-5 bg-gray-900 border border-gray-800/50 rounded-xl cursor-pointer hover:border-gray-700/80 hover:bg-gray-900/80 transition-all duration-150">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-semibold text-gray-100 text-base leading-snug">{project.name}</h3>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-all">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path
              d="M2 2l9 9M11 2l-9 9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {project.description ? (
        <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed flex-1">
          {project.description}
        </p>
      ) : (
        <p className="text-sm text-gray-700 italic flex-1">No description</p>
      )}

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-800/50">
        <span className="text-xs text-gray-600">{date}</span>
        <span className="text-xs text-indigo-400 font-medium group-hover:text-indigo-300 transition-colors">
          Open →
        </span>
      </div>
    </div>
  )
}

function ProjectModal({onClose, onCreate}: {onClose: () => void; onCreate: (p: Project) => void}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      const project = await apiFetch<Project>('POST', '/api/projects', {name, description})
      onCreate(project)
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
          <h2 className="font-semibold text-gray-100">New Project</h2>
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

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Probuild"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700/50 rounded-lg text-gray-100 placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Project context
              <span className="text-gray-600 font-normal ml-1">
                (helps AI understand the architecture)
              </span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. API — Node.js REST server. Web — React SPA. Mobile — React Native. All three use /api/v1/auth/* for authentication. Critical areas: checkout, auth flow."
              rows={5}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700/50 rounded-lg text-gray-100 placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-colors resize-none"
            />
          </div>

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
              disabled={loading || !name.trim()}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
