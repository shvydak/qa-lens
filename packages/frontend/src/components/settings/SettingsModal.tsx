import {useEffect, useState} from 'react'
import AIProviderPanel from './AIProviderPanel.tsx'
import GitHubTokensPanel from './GitHubTokensPanel.tsx'
import ThemePanel from './ThemePanel.tsx'

type Tab = 'ai' | 'tokens' | 'theme'

const TABS: Array<{id: Tab; label: string; description: string; icon: JSX.Element}> = [
  {
    id: 'ai',
    label: 'AI Provider',
    description: 'Choose which model runs analysis',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M7 1.5v1.5M7 11v1.5M1.5 7H3M11 7h1.5M3.1 3.1l1 1M9.9 9.9l1 1M3.1 10.9l1-1M9.9 4.1l1-1"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'tokens',
    label: 'GitHub Tokens',
    description: 'Reuse credentials across projects',
    icon: (
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
    ),
  },
  {
    id: 'theme',
    label: 'Appearance',
    description: 'Coming soon',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7 1.5v11" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7 1.5a5.5 5.5 0 010 11z" fill="currentColor" />
      </svg>
    ),
  },
]

export default function SettingsModal({onClose}: {onClose: () => void}) {
  const [tab, setTab] = useState<Tab>('ai')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl h-[34rem] flex bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl overflow-hidden">
        <aside className="w-56 flex-shrink-0 border-r border-gray-800/60 bg-gray-950/40 flex flex-col">
          <div className="px-5 py-5 border-b border-gray-800/60">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">
              Settings
            </p>
            <h2 className="mt-1 text-sm font-semibold text-gray-100">Workspace preferences</h2>
          </div>
          <nav className="flex-1 px-3 py-3 space-y-0.5">
            {TABS.map((t) => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                    active
                      ? 'bg-indigo-500/15 text-indigo-200'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                  }`}>
                  <span
                    className={`mt-0.5 ${active ? 'text-indigo-300' : 'text-gray-500'}`}
                    aria-hidden>
                    {t.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="block text-[11px] text-gray-600 mt-0.5 truncate">
                      {t.description}
                    </span>
                  </span>
                </button>
              )
            })}
          </nav>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between h-14 px-6 border-b border-gray-800/60 flex-shrink-0">
            <h3 className="text-sm font-semibold text-gray-100">
              {TABS.find((t) => t.id === tab)?.label}
            </h3>
            <button
              onClick={onClose}
              aria-label="Close settings"
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

          <div className="flex-1 overflow-y-auto">
            {tab === 'ai' && <AIProviderPanel />}
            {tab === 'tokens' && <GitHubTokensPanel />}
            {tab === 'theme' && <ThemePanel />}
          </div>
        </div>
      </div>
    </div>
  )
}
