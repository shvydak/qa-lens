import {join} from 'path'
import {describe, expect, it, beforeEach, vi} from 'vitest'
import type Database from 'better-sqlite3'
import type {DiffResult} from '../../types/index.js'
import {createTestDb} from '../helpers/db.js'

const childProcessMocks = vi.hoisted(() => {
  type ExecCallback = (error: Error | null, stdout?: string, stderr?: string) => void
  type MockStdin = {
    on: (event: 'error', handler: (err: NodeJS.ErrnoException) => void) => MockStdin
    end: (value: string) => void
  }

  const prompts: string[] = []
  let emitEpipeOnWrite = false

  function createStdin(): MockStdin {
    const errorHandlers: Array<(err: NodeJS.ErrnoException) => void> = []
    const stdin: MockStdin = {
      on: (_event, handler) => {
        errorHandlers.push(handler)
        return stdin
      },
      end: (value) => {
        prompts.push(value)
        if (emitEpipeOnWrite) {
          for (const handler of errorHandlers) {
            handler(Object.assign(new Error('write EPIPE'), {code: 'EPIPE'}))
          }
        }
      },
    }
    return stdin
  }

  const execFileMock = vi.fn(
    (
      command: string,
      args: string[],
      optionsOrCallback: Record<string, unknown> | ExecCallback,
      maybeCallback?: ExecCallback
    ) => {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
      const child = {stdin: createStdin()}

      setTimeout(() => {
        if (!callback) return
        if (command === 'which') {
          const available = args[0] === 'cursor-agent'
          if (available) callback(null, '/opt/homebrew/bin/cursor-agent\n', '')
          else callback(Object.assign(new Error('not found'), {code: 1}), '', '')
          return
        }

        if (command === 'cursor-agent') {
          callback(
            null,
            JSON.stringify({
              type: 'result',
              subtype: 'success',
              is_error: false,
              result: JSON.stringify({
                summary: 'Cursor analyzed the changes.',
                tests: [
                  {
                    title: 'Check checkout',
                    priority: 'high',
                    area: 'Checkout',
                    user_scenario: 'A user completes checkout.',
                    preconditions: ['A product is in the cart.'],
                    steps: ['Open the cart.', 'Place the order.', 'Check the result.'],
                    expected_result: 'The order is created.',
                    risk: 'Checkout may fail.',
                  },
                ],
                regressions: ['Checkout could stop working.'],
                cross_repo_impacts: ['Frontend checkout should still call the backend.'],
              }),
              session_id: 'cursor-session',
            }),
            ''
          )
          return
        }

        callback(Object.assign(new Error(`unexpected command: ${command}`), {code: 1}), '', '')
      }, 0)

      return child
    }
  )

  const execFile = vi.fn(execFileMock) as typeof execFileMock & {
    [key: symbol]: unknown
  }

  execFile[Symbol.for('nodejs.util.promisify.custom')] = (
    command: string,
    args: string[],
    options?: Record<string, unknown>
  ) => {
    let child: {stdin: MockStdin} | undefined
    const promise = new Promise<{stdout: string; stderr: string}>((resolve, reject) => {
      child = execFileMock(command, args, options ?? {}, (error, stdout = '', stderr = '') => {
        if (error) {
          Object.assign(error, {stdout, stderr})
          reject(error)
          return
        }
        resolve({stdout, stderr})
      }) as {stdin: MockStdin}
    }) as Promise<{stdout: string; stderr: string}> & {child?: {stdin: MockStdin}}
    promise.child = child
    return promise
  }

  return {
    execFile,
    execFileMock,
    prompts,
    setEmitEpipeOnWrite: (value: boolean) => {
      emitEpipeOnWrite = value
    },
  }
})

let testDb: Database.Database

vi.mock('child_process', () => ({
  execFile: childProcessMocks.execFile,
}))

vi.mock('../../db/index.js', () => ({
  getDb: () => testDb,
}))

import {config} from '../../config.js'
import {analyze} from '../../services/AIService.js'

describe('AIService Cursor provider', () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.clearAllMocks()
    childProcessMocks.prompts.length = 0
    childProcessMocks.setEmitEpipeOnWrite(false)
    config.managedReposPath = join(process.cwd(), 'managed-repos-test')
    testDb
      .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
      .run('default_ai_provider', 'cursor')
  })

  it('runs cursor-agent and parses the JSON result payload', async () => {
    testDb
      .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
      .run('ai_model_cursor', 'auto')

    const result = await analyze(makeInput([join(config.managedReposPath, 'repo-a')]))

    expect(result.summary).toBe('Cursor analyzed the changes.')
    expect(result.tests[0]).toMatchObject({
      title: 'Check checkout',
      priority: 'high',
      area: 'Checkout',
    })
    expect(result.regressions).toEqual(['Checkout could stop working.'])
    expect(result.cross_repo_impacts).toEqual(['Frontend checkout should still call the backend.'])

    expect(childProcessMocks.execFileMock).toHaveBeenCalledWith(
      'cursor-agent',
      expect.arrayContaining([
        '-p',
        '--model',
        'auto',
        '--output-format',
        'json',
        '--mode',
        'ask',
        '--trust',
        '--workspace',
        config.managedReposPath,
      ]),
      expect.any(Object),
      expect.any(Function)
    )
    expect(childProcessMocks.prompts[0]).toContain('Repository:')
  })

  it('rejects repositories outside the managed clone root', async () => {
    await expect(analyze(makeInput(['/tmp/external-repo']))).rejects.toThrow(
      'only supports managed GitHub repositories'
    )
  })

  it('ignores stdin EPIPE when the CLI closes input early', async () => {
    childProcessMocks.setEmitEpipeOnWrite(true)

    await expect(
      analyze(makeInput([join(config.managedReposPath, 'repo-a')]))
    ).resolves.toMatchObject({
      summary: 'Cursor analyzed the changes.',
    })
  })
})

function makeInput(repoPaths: string[]) {
  return {
    projectName: 'Project',
    projectDescription: 'Web app and API.',
    repos: repoPaths.map(
      (repoPath, index): DiffResult => ({
        repoId: `repo-${index}`,
        repositoryBranchId: `branch-${index}`,
        repoPath,
        branch: 'main',
        commits: [
          {
            hash: 'abcdef123456',
            shortHash: 'abcdef1',
            author: 'Dev',
            date: '2026-05-05T10:00:00Z',
            message: 'Update checkout',
          },
        ],
        diff: 'diff --git a/file.ts b/file.ts',
        filesChanged: ['file.ts'],
        stats: '1 file changed',
        fromHash: 'old',
        toHash: 'new',
      })
    ),
  }
}
