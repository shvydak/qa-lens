import {execFile} from 'child_process'
import {mkdir, writeFile} from 'fs/promises'
import path from 'path'
import {promisify} from 'util'
import {config} from '../config.js'
import {buildAnalysisPrompt} from './prompts/analysis.js'
import {
  detectProviderAvailability,
  getAIProviderModel,
  getDefaultAIProvider,
} from './SettingsService.js'
import type {DiffResult, AIAnalysisOutput} from '../types/index.js'

const execFileAsync = promisify(execFile)

const AI_DEBUG_DIR = path.resolve(process.cwd(), '.ai-debug')

async function dumpAIDebug(
  provider: string,
  prompt: string,
  rawResponse: string,
  meta: Record<string, unknown>
): Promise<void> {
  if (!process.env.AI_DEBUG_DUMP) return
  try {
    await mkdir(AI_DEBUG_DIR, {recursive: true})
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const base = path.join(AI_DEBUG_DIR, `${ts}-${provider}`)
    await writeFile(`${base}-prompt.txt`, prompt, 'utf8')
    await writeFile(`${base}-response.json`, rawResponse, 'utf8')
    await writeFile(`${base}-meta.json`, JSON.stringify(meta, null, 2), 'utf8')
    console.log(`[AIService] dumped AI debug to ${base}-{prompt,response,meta}`)
  } catch (err) {
    console.warn('[AIService] failed to dump AI debug', err)
  }
}

interface AnalysisInput {
  projectName: string
  projectDescription: string
  repos: DiffResult[]
}

export class AllProvidersFailedError extends Error {
  constructor(public readonly errors: string[]) {
    super(`All AI providers failed:\n${errors.join('\n')}`)
  }
}

async function isCommandAvailable(cmd: string): Promise<boolean> {
  try {
    await execFileAsync('which', [cmd])
    return true
  } catch {
    return false
  }
}

export {isCommandAvailable}

function parseAIJson(text: string): AIAnalysisOutput {
  let clean = text.trim()
  if (clean.startsWith('```json')) clean = clean.replace(/^```json\n?/, '').replace(/\n?```$/, '')
  else if (clean.startsWith('```')) clean = clean.replace(/^```\n?/, '').replace(/\n?```$/, '')

  if (!clean.startsWith('{') && !clean.startsWith('[')) {
    const extracted = extractJsonBlock(clean)
    if (extracted) clean = extracted
  }

  const parsed = JSON.parse(clean)
  return {
    summary: String(parsed.summary || ''),
    tests: Array.isArray(parsed.tests)
      ? parsed.tests.map((t: Record<string, unknown>) => {
          const priority = String(t.priority || '')
          return {
            title: String(t.title || ''),
            priority: ['high', 'medium', 'low'].includes(priority)
              ? (priority as 'high' | 'medium' | 'low')
              : 'medium',
            area: String(t.area || 'General'),
            user_scenario: String(t.user_scenario || ''),
            preconditions: toStringArray(t.preconditions),
            steps: toStringArray(t.steps),
            expected_result: String(t.expected_result || ''),
            risk: String(t.risk || ''),
            technical_context: t.technical_context ? String(t.technical_context) : undefined,
          }
        })
      : [],
    regressions: Array.isArray(parsed.regressions) ? parsed.regressions.map(String) : [],
    cross_repo_impacts: Array.isArray(parsed.cross_repo_impacts)
      ? parsed.cross_repo_impacts.map(String)
      : [],
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

function extractJsonBlock(text: string): string | null {
  const firstBrace = text.indexOf('{')
  const firstBracket = text.indexOf('[')
  const candidates = [firstBrace, firstBracket].filter((i) => i >= 0)
  if (candidates.length === 0) return null
  const start = Math.min(...candidates)
  const open = text[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

async function runClaudeCli(prompt: string, repoPaths: string[]): Promise<AIAnalysisOutput> {
  if (!(await isCommandAvailable('claude'))) throw new Error('claude CLI not found')

  const addDirArgs = repoPaths.flatMap((p) => ['--add-dir', p])
  const model = getAIProviderModel('claude')
  const modelArgs = model ? ['--model', model] : []
  console.log('[AIService] claude CLI invoke', {model: model ?? '(default)', repoPaths})
  const claudePromise = execFileAsync(
    'claude',
    ['-p', ...addDirArgs, ...modelArgs, '--output-format', 'json'],
    {timeout: 300_000, maxBuffer: 10 * 1024 * 1024}
  )
  writePromptToStdin(claudePromise.child.stdin, prompt)
  let stdout = ''
  try {
    const result = await claudePromise
    stdout = result.stdout as string
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string | Buffer
      stderr?: string | Buffer
      code?: string | number
      signal?: string
    }
    const out = e.stdout?.toString() ?? ''
    const errOut = e.stderr?.toString() ?? ''
    await dumpAIDebug('claude', prompt, out || errOut || e.message, {
      requestedModel: model ?? null,
      repoPaths,
      failed: true,
      exitCode: e.code ?? null,
      signal: e.signal ?? null,
      stderr: errOut,
    })
    console.error('[AIService] claude CLI failed', {
      code: e.code,
      signal: e.signal,
      stderrLen: errOut.length,
      stdoutLen: out.length,
    })
    const detail =
      [
        e.signal ? `signal=${e.signal}` : null,
        e.code !== undefined ? `code=${e.code}` : null,
        errOut.trim() ? `stderr: ${errOut.trim().slice(0, 500)}` : null,
        !errOut.trim() && out.trim() ? `stdout: ${out.trim().slice(0, 500)}` : null,
      ]
        .filter(Boolean)
        .join(' | ') || 'no output'
    throw new Error(`claude CLI failed (${detail})`)
  }

  const wrapper = JSON.parse(stdout.trim())
  let usedModels: string[] = []
  if (wrapper && typeof wrapper === 'object') {
    const modelUsage = (wrapper as Record<string, unknown>).modelUsage
    usedModels = modelUsage && typeof modelUsage === 'object' ? Object.keys(modelUsage) : []
    console.log('[AIService] claude CLI response models', usedModels)
  }
  const text = typeof wrapper.result === 'string' ? wrapper.result : stdout
  await dumpAIDebug('claude', prompt, stdout, {
    requestedModel: model ?? null,
    usedModels,
    repoPaths,
  })
  return parseAIJson(text)
}

async function runGeminiCli(prompt: string): Promise<AIAnalysisOutput> {
  if (!(await isCommandAvailable('gemini'))) throw new Error('gemini CLI not found')

  const model = getAIProviderModel('gemini')
  const modelArgs = model ? ['--model', model] : []
  console.log('[AIService] gemini CLI invoke', {model: model ?? '(default)'})
  const geminiPromise = execFileAsync('gemini', [...modelArgs, '--output-format', 'json'], {
    timeout: 300_000,
    maxBuffer: 10 * 1024 * 1024,
  })
  writePromptToStdin(geminiPromise.child.stdin, prompt)
  const {stdout} = await geminiPromise

  await dumpAIDebug('gemini', prompt, stdout, {requestedModel: model ?? null})

  try {
    const wrapper = JSON.parse(stdout.trim())
    const text = typeof wrapper.response === 'string' ? wrapper.response : stdout
    return parseAIJson(text)
  } catch {
    return parseAIJson(stdout)
  }
}

async function runCursorCli(prompt: string, repoPaths: string[]): Promise<AIAnalysisOutput> {
  const command = await getCursorCliCommand()
  if (!command) throw new Error('Cursor CLI agent or cursor-agent not found')

  assertRepoPathsInsideManagedRoot(repoPaths)

  const model = getAIProviderModel('cursor')
  const modelArgs = model ? ['--model', model] : []
  const workspace = path.resolve(config.managedReposPath)
  console.log('[AIService] cursor CLI invoke', {
    command,
    model: model ?? '(default)',
    workspace,
    repoPaths,
  })
  const cursorPromise = execFileAsync(
    command,
    [
      '-p',
      ...modelArgs,
      '--output-format',
      'json',
      '--mode',
      'ask',
      '--trust',
      '--workspace',
      workspace,
    ],
    {timeout: 300_000, maxBuffer: 10 * 1024 * 1024}
  )
  writePromptToStdin(cursorPromise.child.stdin, prompt)

  let stdout = ''
  try {
    const result = await cursorPromise
    stdout = result.stdout as string
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string | Buffer
      stderr?: string | Buffer
      code?: string | number
      signal?: string
    }
    const out = e.stdout?.toString() ?? ''
    const errOut = e.stderr?.toString() ?? ''
    await dumpAIDebug('cursor', prompt, out || errOut || e.message, {
      requestedModel: model ?? null,
      repoPaths,
      workspace,
      failed: true,
      exitCode: e.code ?? null,
      signal: e.signal ?? null,
      stderr: errOut,
    })
    const detail =
      [
        e.signal ? `signal=${e.signal}` : null,
        e.code !== undefined ? `code=${e.code}` : null,
        errOut.trim() ? `stderr: ${errOut.trim().slice(0, 500)}` : null,
        !errOut.trim() && out.trim() ? `stdout: ${out.trim().slice(0, 500)}` : null,
      ]
        .filter(Boolean)
        .join(' | ') || 'no output'
    throw new Error(`Cursor CLI failed (${detail})`)
  }

  const wrapper = JSON.parse(stdout.trim())
  const text = typeof wrapper.result === 'string' ? wrapper.result : stdout
  await dumpAIDebug('cursor', prompt, stdout, {
    requestedModel: model ?? null,
    repoPaths,
    workspace,
    sessionId: typeof wrapper.session_id === 'string' ? wrapper.session_id : null,
  })
  return parseAIJson(text)
}

async function getCursorCliCommand(): Promise<string | null> {
  if (await isCommandAvailable('agent')) return 'agent'
  if (await isCommandAvailable('cursor-agent')) return 'cursor-agent'
  return null
}

function assertRepoPathsInsideManagedRoot(repoPaths: string[]): void {
  const managedRoot = path.resolve(config.managedReposPath)
  const outsidePath = repoPaths.find((repoPath) => {
    const relativePath = path.relative(managedRoot, path.resolve(repoPath))
    return relativePath.startsWith('..') || path.isAbsolute(relativePath)
  })

  if (outsidePath) {
    throw new Error(
      `Cursor CLI provider only supports managed GitHub repositories inside ${managedRoot}; found ${outsidePath}`
    )
  }
}

function writePromptToStdin(stdin: NodeJS.WritableStream | null | undefined, prompt: string): void {
  if (!stdin) return
  stdin.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') return
    console.warn('[AIService] failed to write prompt to CLI stdin', err)
  })
  stdin.end(prompt)
}

async function runAnthropicApi(prompt: string): Promise<AIAnalysisOutput> {
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: [{role: 'user', content: prompt}],
    }),
  })

  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`)

  const data = (await response.json()) as {content: Array<{type: string; text: string}>}
  const text = data.content.find((b) => b.type === 'text')?.text || ''
  await dumpAIDebug('anthropic', prompt, JSON.stringify(data, null, 2), {
    model: 'claude-sonnet-4-5',
  })
  return parseAIJson(text)
}

export async function analyze(input: AnalysisInput): Promise<AIAnalysisOutput> {
  const prompt = buildAnalysisPrompt(input)
  const repoPaths = input.repos.map((r) => r.repoPath)
  const errors: string[] = []

  const userDefault = getDefaultAIProvider()
  if (userDefault) {
    const info = await detectProviderAvailability(userDefault)
    if (!info.available) {
      throw new AllProvidersFailedError([
        `[${userDefault}] selected as default in Settings but unavailable: ${info.reason}`,
      ])
    }
    return runProvider(userDefault, prompt, repoPaths)
  }

  for (const provider of config.aiProviders) {
    try {
      return await runProvider(provider, prompt, repoPaths)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`[${provider}] ${msg}`)
      console.error(`AI provider ${provider} failed:`, msg)
    }
  }

  throw new AllProvidersFailedError(errors)
}

function runProvider(
  provider: string,
  prompt: string,
  repoPaths: string[]
): Promise<AIAnalysisOutput> {
  if (provider === 'claude') return runClaudeCli(prompt, repoPaths)
  if (provider === 'gemini') return runGeminiCli(prompt)
  if (provider === 'cursor') return runCursorCli(prompt, repoPaths)
  if (provider === 'anthropic') return runAnthropicApi(prompt)
  return Promise.reject(new Error(`Unknown AI provider: ${provider}`))
}
