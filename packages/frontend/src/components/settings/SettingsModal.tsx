import {useEffect, useState} from 'react'
import {apiFetch} from '../../api/client.ts'
import type {
  AIProviderId,
  AppSettings,
  CLIModelProviderId,
  GitHubCredential,
} from '../../types/index.ts'

type Tab = 'ai' | 'tokens' | 'theme'
type SettingsPatchResponse = Pick<
  AppSettings,
  'defaultAiProvider' | 'aiProviderModels' | 'aiModelOptions'
>

const CLI_MODEL_FIELDS: Array<{
  provider: CLIModelProviderId
  label: string
  placeholder: string
  hint: string
}> = [
  {
    provider: 'claude',
    label: 'Claude CLI model',
    placeholder: 'Default from Claude CLI',
    hint: 'Uses Claude Code aliases so Sonnet, Opus, and Haiku track the latest supported models.',
  },
  {
    provider: 'gemini',
    label: 'Gemini CLI model',
    placeholder: 'Default from Gemini CLI',
    hint: 'Example: gemini-2.5-pro',
  },
  {
    provider: 'cursor',
    label: 'Cursor CLI model',
    placeholder: 'Default from Cursor CLI',
    hint: 'Example: gpt-5.3-codex. Available models depend on the Cursor account and team policy.',
  },
]

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

function AIProviderPanel() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [modelDrafts, setModelDrafts] = useState<Record<CLIModelProviderId, string>>({
    claude: '',
    gemini: '',
    cursor: '',
  })
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch<AppSettings>('GET', '/api/settings')
      .then((data) => {
        setSettings(data)
        setModelDrafts({
          claude: data.aiProviderModels.claude ?? '',
          gemini: data.aiProviderModels.gemini ?? '',
          cursor: data.aiProviderModels.cursor ?? '',
        })
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
  }, [])

  const saveProvider = async (defaultAiProvider: AIProviderId | null) => {
    setSaving(true)
    setError('')
    try {
      const updated = await apiFetch<SettingsPatchResponse>('PATCH', '/api/settings', {
        defaultAiProvider,
      })
      setSettings((prev) => (prev ? {...prev, ...updated} : prev))
      setSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
      setOpen(false)
    }
  }

  const saveModel = async (provider: CLIModelProviderId) => {
    setSaving(true)
    setError('')
    try {
      const updated = await apiFetch<SettingsPatchResponse>('PATCH', '/api/settings', {
        aiProviderModels: {[provider]: modelDrafts[provider].trim() || null},
      })
      setSettings((prev) => (prev ? {...prev, ...updated} : prev))
      setModelDrafts({
        claude: updated.aiProviderModels.claude ?? '',
        gemini: updated.aiProviderModels.gemini ?? '',
        cursor: updated.aiProviderModels.cursor ?? '',
      })
      setSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return (
      <div className="p-6 space-y-3">
        <div className="h-5 w-40 rounded bg-gray-800/70 animate-pulse" />
        <div className="h-12 rounded-lg bg-gray-800/40 animate-pulse" />
      </div>
    )
  }

  const current = settings.availableProviders.find((p) => p.id === settings.defaultAiProvider)
  const visibleModelFields =
    settings.defaultAiProvider === null
      ? CLI_MODEL_FIELDS
      : CLI_MODEL_FIELDS.filter((field) => field.provider === settings.defaultAiProvider)
  const modelSectionTitle =
    settings.defaultAiProvider === null
      ? 'CLI models for waterfall'
      : visibleModelFields.length > 0
        ? `${current?.label ?? 'Selected provider'} model`
        : 'Provider model'
  const modelSectionHelp =
    settings.defaultAiProvider === null
      ? 'Auto mode can use any available CLI provider, so each provider keeps its own model preference.'
      : visibleModelFields.length > 0
        ? 'Choose the model used by the selected provider, or leave it empty to use the CLI default.'
        : 'This provider does not use a local CLI model setting.'

  return (
    <div className="p-6 space-y-6">
      <section>
        <p className="text-xs font-medium text-gray-400 mb-2">Default provider</p>
        <p className="text-xs text-gray-600 leading-relaxed mb-4">
          Analysis runs on the provider you select. If none is selected, QA Lens falls back to the
          waterfall order from <code className="text-gray-500">AI_PROVIDERS</code>.
        </p>

        <div className="relative">
          <button
            type="button"
            disabled={saving}
            onClick={() => setOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-3 px-3.5 py-3 bg-gray-800 border border-gray-700/50 rounded-lg text-left transition-colors hover:border-gray-600 focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  current?.available ? 'bg-emerald-400' : current ? 'bg-red-400' : 'bg-gray-600'
                }`}
              />
              <div className="min-w-0">
                <p className="text-sm text-gray-100 font-medium truncate">
                  {current ? current.label : 'Auto (waterfall)'}
                </p>
                <p className="text-[11px] text-gray-600 mt-0.5 truncate">
                  {current
                    ? current.available
                      ? 'Available on this host'
                      : current.reason || 'Unavailable'
                    : 'Tries each provider in order until one succeeds'}
                </p>
              </div>
            </div>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}>
              <path
                d="M2.5 4.5l3.5 3.5 3.5-3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {open && (
            <div className="absolute z-10 mt-1.5 w-full overflow-hidden rounded-lg border border-gray-700/70 bg-gray-900 shadow-2xl">
              <ProviderOption
                label="Auto (waterfall)"
                description="Try claude -> gemini -> cursor -> anthropic in order"
                selected={settings.defaultAiProvider === null}
                onClick={() => saveProvider(null)}
              />
              <div className="border-t border-gray-800/80" />
              {settings.availableProviders.map((p) => (
                <ProviderOption
                  key={p.id}
                  label={p.label}
                  description={p.available ? 'Available on this host' : p.reason || 'Unavailable'}
                  available={p.available}
                  selected={settings.defaultAiProvider === p.id}
                  onClick={() => p.available && saveProvider(p.id)}
                />
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
        )}
        {savedAt && !error && <p className="mt-3 text-xs text-emerald-400/90">Saved</p>}
      </section>

      <section className="pt-5 border-t border-gray-800/60">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-xs font-medium text-gray-400">{modelSectionTitle}</p>
            <p className="text-xs text-gray-600 leading-relaxed mt-1">{modelSectionHelp}</p>
          </div>
        </div>
        {visibleModelFields.length > 0 ? (
          <div className="space-y-3">
            {visibleModelFields.map((field) => {
              const saved = settings.aiProviderModels[field.provider] ?? ''
              const dirty = modelDrafts[field.provider].trim() !== saved
              const options = settings.aiModelOptions[field.provider] ?? []
              return (
                <div key={field.provider} className="space-y-1.5">
                  <label
                    htmlFor={`model-${field.provider}`}
                    className="block text-[11px] font-medium text-gray-500">
                    {field.label}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={`model-${field.provider}`}
                      value={modelDrafts[field.provider]}
                      onChange={(e) =>
                        setModelDrafts((prev) => ({...prev, [field.provider]: e.target.value}))
                      }
                      placeholder={field.placeholder}
                      disabled={saving}
                      className="min-w-0 flex-1 rounded-lg border border-gray-800/80 bg-gray-950/50 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-700 outline-none transition-colors focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30"
                    />
                    <button
                      type="button"
                      disabled={saving || !dirty}
                      onClick={() => saveModel(field.provider)}
                      className={`rounded-lg px-3 text-xs font-medium transition-colors ${
                        dirty
                          ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                          : 'bg-gray-800/60 text-gray-600 cursor-not-allowed'
                      }`}>
                      Save
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-700">{field.hint}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <ModelChip
                      label="CLI default"
                      active={!modelDrafts[field.provider].trim()}
                      onClick={() => setModelDrafts((prev) => ({...prev, [field.provider]: ''}))}
                    />
                    {options.map((option) => (
                      <ModelChip
                        key={option.id}
                        label={option.label}
                        active={modelDrafts[field.provider].trim() === option.id}
                        muted={option.source === 'saved'}
                        onClick={() =>
                          setModelDrafts((prev) => ({...prev, [field.provider]: option.id}))
                        }
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-800/70 bg-gray-950/40 px-3 py-3 text-xs text-gray-600">
            Anthropic API uses the configured API provider directly, so there is no CLI model to
            customize here.
          </div>
        )}
      </section>

      <section className="pt-5 border-t border-gray-800/60">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 mb-3">
          Detected on this host
        </p>
        <ul className="space-y-1.5">
          {settings.availableProviders.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-950/40 border border-gray-800/60">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  p.available ? 'bg-emerald-400' : 'bg-gray-700'
                }`}
              />
              <span className="text-sm text-gray-300 flex-1">{p.label}</span>
              <span className="text-[11px] text-gray-600">
                {p.available ? 'ready' : p.reason || 'unavailable'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function ModelChip({
  label,
  active,
  muted = false,
  onClick,
}: {
  label: string
  active: boolean
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
        active
          ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-200'
          : muted
            ? 'border-gray-800 bg-gray-950/30 text-gray-600 hover:text-gray-400'
            : 'border-gray-800 bg-gray-950/40 text-gray-500 hover:border-gray-700 hover:text-gray-300'
      }`}>
      {label}
    </button>
  )
}

function ProviderOption({
  label,
  description,
  selected,
  available = true,
  onClick,
}: {
  label: string
  description: string
  selected: boolean
  available?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors ${
        available ? 'hover:bg-gray-800/80' : 'cursor-not-allowed opacity-50'
      } ${selected ? 'bg-indigo-500/10' : ''}`}>
      <div className="min-w-0">
        <p
          className={`text-sm font-medium truncate ${
            selected ? 'text-indigo-200' : 'text-gray-200'
          }`}>
          {label}
        </p>
        <p className="text-[11px] text-gray-600 mt-0.5 truncate">{description}</p>
      </div>
      {selected && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="text-indigo-300 flex-shrink-0">
          <path
            d="M2.5 7.5l3 3 6-6.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}

function GitHubTokensPanel() {
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

function ThemePanel() {
  return (
    <div className="p-6">
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-4 text-gray-600">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 3v16" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 3a8 8 0 010 16z" fill="currentColor" />
          </svg>
        </div>
        <p className="text-sm text-gray-300 font-medium">Appearance</p>
        <p className="text-xs text-gray-600 mt-1.5 max-w-xs">
          Light theme and accent color customization are on the roadmap. QA Lens currently runs in
          dark mode only.
        </p>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
}
