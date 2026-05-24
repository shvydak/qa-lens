import {useEffect, useState} from 'react'
import {apiFetch} from '../../api/client.ts'
import type {AIProviderId, AppSettings, CLIModelProviderId} from '../../types/index.ts'

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

export default function AIProviderPanel() {
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
