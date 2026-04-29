import {execFile} from 'child_process'
import {promisify} from 'util'
import {config} from '../config.js'
import {buildAnalysisPrompt} from './prompts/analysis.js'
import type {DiffResult, AIAnalysisOutput} from '../types/index.js'

const execFileAsync = promisify(execFile)

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

function parseAIJson(text: string): AIAnalysisOutput {
  let clean = text.trim()
  if (clean.startsWith('```json')) clean = clean.replace(/^```json\n?/, '').replace(/\n?```$/, '')
  else if (clean.startsWith('```')) clean = clean.replace(/^```\n?/, '').replace(/\n?```$/, '')

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

async function runClaudeCli(prompt: string, repoPaths: string[]): Promise<AIAnalysisOutput> {
  if (!(await isCommandAvailable('claude'))) throw new Error('claude CLI not found')

  const addDirArgs = repoPaths.flatMap((p) => ['--add-dir', p])
  const {stdout} = await execFileAsync(
    'claude',
    ['-p', prompt, ...addDirArgs, '--output-format', 'json'],
    {timeout: 180_000, maxBuffer: 10 * 1024 * 1024}
  )

  const wrapper = JSON.parse(stdout.trim())
  const text = typeof wrapper.result === 'string' ? wrapper.result : stdout
  return parseAIJson(text)
}

async function runGeminiCli(prompt: string): Promise<AIAnalysisOutput> {
  if (!(await isCommandAvailable('gemini'))) throw new Error('gemini CLI not found')

  const {stdout} = await execFileAsync('gemini', ['-p', prompt, '--output-format', 'json'], {
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  })

  try {
    const wrapper = JSON.parse(stdout.trim())
    const text = typeof wrapper.response === 'string' ? wrapper.response : stdout
    return parseAIJson(text)
  } catch {
    return parseAIJson(stdout)
  }
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
  return parseAIJson(text)
}

export async function analyze(input: AnalysisInput): Promise<AIAnalysisOutput> {
  const prompt = buildAnalysisPrompt(input)
  const repoPaths = input.repos.map((r) => r.repoPath)
  const errors: string[] = []

  for (const provider of config.aiProviders) {
    try {
      if (provider === 'claude') return await runClaudeCli(prompt, repoPaths)
      if (provider === 'gemini') return await runGeminiCli(prompt)
      if (provider === 'anthropic') return await runAnthropicApi(prompt)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`[${provider}] ${msg}`)
      console.error(`AI provider ${provider} failed:`, msg)
    }
  }

  throw new AllProvidersFailedError(errors)
}
