import { Outlet, NavLink } from 'react-router-dom'

export default function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-gray-800/60 bg-gray-950">
        <div className="h-14 flex items-center px-5 border-b border-gray-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="2.5" fill="#6366f1" />
                <path d="M7 1v2M7 11v2M1 7h2M11 7h2" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M3.05 3.05l1.42 1.42M9.53 9.53l1.42 1.42M3.05 10.95l1.42-1.42M9.53 4.47l1.42-1.42" stroke="#6366f1" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
              </svg>
            </div>
            <span className="font-semibold text-gray-100 tracking-tight">QA Lens</span>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-0.5">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`
            }
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <rect x="1" y="1" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <rect x="8.5" y="1" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <rect x="1" y="8.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            Projects
          </NavLink>
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
