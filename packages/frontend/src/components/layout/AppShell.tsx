import {useState, useEffect, type CSSProperties} from 'react'
import {Outlet, Link, useLocation, useMatch} from 'react-router-dom'
import {apiFetch} from '../../api/client.ts'
import type {Project, TestSet, ChecklistCounts} from '../../types/index.ts'
import {useActiveProject} from '../../contexts/ActiveProjectContext.tsx'

export default function AppShell() {
  const [projects, setProjects] = useState<Project[]>([])
  const [sidebarTestSets, setSidebarTestSets] = useState<TestSet[]>([])
  const location = useLocation()
  const {activeProjectId, testSetVersion} = useActiveProject()
  const testSetMatch = useMatch('/test-sets/:id')
  const activeTestSetId = testSetMatch?.params.id ?? null

  useEffect(() => {
    apiFetch<Project[]>('GET', '/api/projects')
      .then(setProjects)
      .catch(() => {})
  }, [location.pathname])

  useEffect(() => {
    if (!activeProjectId) {
      setSidebarTestSets([])
      return
    }
    apiFetch<TestSet[]>('GET', `/api/projects/${activeProjectId}/test-sets`)
      .then(setSidebarTestSets)
      .catch(() => {})
  }, [activeProjectId, location.pathname, testSetVersion])

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-gray-800/60 bg-gray-950">
        <div className="h-14 flex items-center px-5 border-b border-gray-800/60">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="2.5" fill="#6366f1" />
                <path
                  d="M7 1v2M7 11v2M1 7h2M11 7h2"
                  stroke="#6366f1"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M3.05 3.05l1.42 1.42M9.53 9.53l1.42 1.42M3.05 10.95l1.42-1.42M9.53 4.47l1.42-1.42"
                  stroke="#6366f1"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  opacity="0.5"
                />
              </svg>
            </div>
            <span className="font-semibold text-gray-100 tracking-tight">QA Lens</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3">
          <div className="px-2 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">
              Projects
            </span>
          </div>

          <div className="space-y-0.5">
            {projects.map((project) => {
              const isActive = activeProjectId === project.id
              const projectTestSets = isActive ? sidebarTestSets.slice(0, 6) : []

              return (
                <div key={project.id}>
                  <Link
                    to={`/projects/${project.id}`}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-indigo-500/15 text-indigo-300'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                    }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 opacity-40" />
                    <span className="truncate">{project.name}</span>
                  </Link>

                  {isActive && projectTestSets.length > 0 && (
                    <div className="ml-3 mt-0.5 mb-1 space-y-px border-l border-gray-800/70 pl-2.5">
                      {projectTestSets.map((ts) => (
                        <SidebarTestSetItem
                          key={ts.id}
                          testSet={ts}
                          isActive={activeTestSetId === ts.id}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {projects.length === 0 && (
              <Link
                to="/"
                className="px-2 py-1.5 text-sm text-gray-700 hover:text-gray-500 transition-colors italic">
                No projects yet
              </Link>
            )}
          </div>
        </nav>

        <div className="p-3 border-t border-gray-800/60">
          <p className="text-xs text-gray-600 text-center">QA Lens v0.1</p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

function SidebarTestSetItem({testSet, isActive}: {testSet: TestSet; isActive: boolean}) {
  const counts = testSet.checklistCounts
  const branchLabel = getBranchLabel(testSet)
  const dotColor =
    testSet.status === 'active'
      ? 'bg-indigo-400'
      : testSet.status === 'passed'
        ? 'bg-emerald-500'
        : 'bg-red-400'

  return (
    <Link
      to={`/test-sets/${testSet.id}`}
      className={`block px-2 py-1.5 rounded-lg transition-colors ${
        isActive ? 'bg-indigo-500/15' : 'hover:bg-gray-800/40'
      }`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className={`text-[11px] truncate ${isActive ? 'text-indigo-300' : 'text-gray-500'}`}>
          {branchLabel}
        </span>
      </div>
      {counts && counts.total > 0 ? (
        <div className="h-1 w-full rounded-full overflow-hidden bg-gray-800 flex">
          <ProgressSegments counts={counts} />
        </div>
      ) : (
        <div className="h-1 w-full rounded-full bg-gray-800/60" />
      )}
    </Link>
  )
}

function ProgressSegments({counts}: {counts: ChecklistCounts}) {
  const seg = (n: number): CSSProperties => ({
    flexGrow: n,
    flexShrink: 0,
    flexBasis: 0,
    minWidth: n > 0 ? 2 : 0,
  })
  return (
    <>
      {counts.pass > 0 && <span className="h-full bg-emerald-500/85" style={seg(counts.pass)} />}
      {counts.fail > 0 && <span className="h-full bg-red-500/80" style={seg(counts.fail)} />}
      {counts.skip > 0 && <span className="h-full bg-amber-500/70" style={seg(counts.skip)} />}
      {counts.notTested > 0 && (
        <span className="h-full bg-gray-600/90" style={seg(counts.notTested)} />
      )}
    </>
  )
}

function getBranchLabel(testSet: TestSet): string {
  const targets = testSet.commitTargets ?? []
  if (targets.length > 0) return targets.map((t) => t.branchName).join(', ')
  return testSet.name
}
