import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../api/client.ts'
import type { Project, Repository, TestSet, AnalysisStatus } from '../types/index.ts'
import RepoCard from '../components/repositories/RepoCard.tsx'
import RepoForm from '../components/repositories/RepoForm.tsx'
import AnalysisPanel from '../components/testSets/AnalysisPanel.tsx'
import TestSetCard from '../components/testSets/TestSetCard.tsx'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [repos, setRepos] = useState<Repository[]>([])
  const [testSets, setTestSets] = useState<TestSet[]>([])
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>({ running: false, testSetId: null, error: null })
  const [showRepoForm, setShowRepoForm] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [loading, setLoading] = useState(true)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analysisPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadRepos = useCallback(async () => {
    if (!id) return
    const data = await apiFetch<Repository[]>('GET', `/api/projects/${id}/repos`)
    setRepos(data)
  }, [id])

  const loadTestSets = useCallback(async () => {
    if (!id) return
    const data = await apiFetch<TestSet[]>('GET', `/api/projects/${id}/test-sets`)
    setTestSets(data)
  }, [id])

  const loadAnalysisStatus = useCallback(async () => {
    if (!id) return
    const data = await apiFetch<AnalysisStatus>('GET', `/api/projects/${id}/analyze/status`)
    setAnalysisStatus(data)
    if (!data.running && data.testSetId) {
      clearInterval(analysisPollRef.current!)
      await loadTestSets()
      navigate(`/test-sets/${data.testSetId}`)
    }
    if (!data.running && data.error) {
      clearInterval(analysisPollRef.current!)
    }
  }, [id, loadTestSets, navigate])

  useEffect(() => {
    if (!id) return
    const init = async () => {
      try {
        const [proj] = await Promise.all([
          apiFetch<Project>('GET', `/api/projects/${id}`),
          loadRepos(),
          loadTestSets(),
          loadAnalysisStatus(),
        ])
        setProject(proj)
        setDescDraft(proj.description)
      } finally {
        setLoading(false)
      }
    }
    init()

    pollRef.current = setInterval(loadRepos, 10_000)
    return () => {
      clearInterval(pollRef.current!)
      clearInterval(analysisPollRef.current!)
    }
  }, [id, loadRepos, loadTestSets, loadAnalysisStatus])

  const startAnalysis = async () => {
    if (!id) return
    setAnalysisStatus({ running: true, testSetId: null, error: null })
    try {
      await apiFetch('POST', `/api/projects/${id}/analyze`, {})
    } catch (err) {
      setAnalysisStatus({ running: false, testSetId: null, error: err instanceof Error ? err.message : 'Error' })
      return
    }
    analysisPollRef.current = setInterval(loadAnalysisStatus, 2_000)
  }

  const saveDescription = async () => {
    if (!project) return
    const updated = await apiFetch<Project>('PATCH', `/api/projects/${project.id}`, { description: descDraft })
    setProject(updated)
    setEditingDesc(false)
  }

  const deleteRepo = async (repoId: string) => {
    await apiFetch('DELETE', `/api/repos/${repoId}`)
    setRepos((r) => r.filter((x) => x.id !== repoId))
  }

  const fetchRepo = async (repoId: string) => {
    await apiFetch('POST', `/api/repos/${repoId}/fetch`, {})
    await loadRepos()
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 w-48 bg-gray-900 rounded-lg animate-pulse" />
        <div className="h-4 w-64 bg-gray-900 rounded animate-pulse" />
      </div>
    )
  }

  if (!project) {
    return <div className="p-8 text-gray-500">Project not found</div>
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors mb-6">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Projects
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-100 mb-3">{project.name}</h1>

        {editingDesc ? (
          <div className="space-y-2">
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              rows={4}
              className="w-full px-3 py-2.5 bg-gray-800 border border-indigo-500/50 rounded-lg text-gray-100 text-sm focus:outline-none resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={saveDescription} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors">
                Save
              </button>
              <button onClick={() => { setEditingDesc(false); setDescDraft(project.description) }} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-lg transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditingDesc(true)} className="group text-left">
            {project.description ? (
              <p className="text-sm text-gray-500 leading-relaxed group-hover:text-gray-400 transition-colors max-w-2xl">
                {project.description}
                <span className="text-gray-700 ml-1 group-hover:text-gray-500 transition-colors">(edit)</span>
              </p>
            ) : (
              <p className="text-sm text-gray-700 hover:text-gray-500 transition-colors italic">
                + Add project context for AI
              </p>
            )}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Repositories</h2>
            <button
              onClick={() => setShowRepoForm(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-lg transition-colors border border-gray-700/50"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Add
            </button>
          </div>

          {repos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 bg-gray-900/50 border border-gray-800/50 rounded-xl text-center">
              <p className="text-gray-500 text-sm">No repositories</p>
              <button onClick={() => setShowRepoForm(true)} className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                Add first repo
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {repos.map((repo) => (
                <RepoCard
                  key={repo.id}
                  repo={repo}
                  onDelete={() => deleteRepo(repo.id)}
                  onFetch={() => fetchRepo(repo.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Analysis</h2>

          <AnalysisPanel status={analysisStatus} onAnalyze={startAnalysis} />

          {testSets.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Test set history</h3>
              <div className="space-y-2">
                {testSets.map((ts) => (
                  <TestSetCard key={ts.id} testSet={ts} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showRepoForm && (
        <RepoForm
          projectId={id!}
          onClose={() => setShowRepoForm(false)}
          onAdd={(repo) => {
            setRepos((r) => [...r, repo])
            setShowRepoForm(false)
          }}
        />
      )}
    </div>
  )
}
