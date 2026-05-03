import {execFile} from 'child_process'
import {promisify} from 'util'
import type {CommitInfo, DiffResult} from '../types/index.js'
import {config} from '../config.js'

const execFileAsync = promisify(execFile)
const ALLOWED_GIT_COMMANDS = new Set([
  'branch',
  'checkout',
  'clone',
  'diff',
  'fetch',
  'log',
  'ls-remote',
  'rev-parse',
  'status',
])

interface GitOptions {
  token?: string | null
}

async function git(
  args: string[],
  cwd: string,
  timeout = 30_000,
  options: GitOptions = {}
): Promise<string> {
  assertAllowedGitCommand(args)
  try {
    const {stdout} = await execFileAsync('git', withAuth(args, options.token), {
      cwd,
      timeout,
      maxBuffer: 20 * 1024 * 1024,
    })
    return stdout.trim()
  } catch (err) {
    throw new Error(safeGitErrorMessage(err))
  }
}

async function gitNoCwd(
  args: string[],
  timeout = 30_000,
  options: GitOptions = {}
): Promise<string> {
  assertAllowedGitCommand(args)
  try {
    const {stdout} = await execFileAsync('git', withAuth(args, options.token), {
      timeout,
      maxBuffer: 20 * 1024 * 1024,
    })
    return stdout.trim()
  } catch (err) {
    throw new Error(safeGitErrorMessage(err))
  }
}

function assertAllowedGitCommand(args: string[]): void {
  const command = args[0]
  if (!command || !ALLOWED_GIT_COMMANDS.has(command)) {
    throw new Error(`Refusing unsafe git command: git ${args.join(' ')}`)
  }
}

function withAuth(args: string[], token?: string | null): string[] {
  if (!token?.trim()) return args
  const credentials = Buffer.from(`x-access-token:${token.trim()}`).toString('base64')
  return ['-c', `http.extraHeader=Authorization: Basic ${credentials}`, ...args]
}

function safeGitErrorMessage(err: unknown): string {
  const error = err as {message?: string; stderr?: string}
  const text = `${error.stderr ?? ''}\n${error.message ?? ''}`

  if (/authentication|authorization|permission|403|401/i.test(text)) {
    return 'Git authentication failed. Check the repository URL and token permissions.'
  }
  if (/not found|repository .*not exist|could not read/i.test(text)) {
    return 'Repository not found or access denied.'
  }
  return 'Git command failed'
}

export const __testing = {
  assertAllowedGitCommand,
  safeGitErrorMessage,
  withAuth,
}

export interface RemoteBranch {
  name: string
  commitHash: string
}

export async function validateRepo(localPath: string): Promise<{valid: boolean; error?: string}> {
  try {
    await git(['rev-parse', '--git-dir'], localPath)
    return {valid: true}
  } catch {
    return {valid: false, error: 'Not a valid git repository'}
  }
}

export async function fetchOrigin(
  localPath: string,
  branch: string,
  token?: string | null
): Promise<void> {
  await git(['fetch', 'origin', branch, '--prune'], localPath, 30_000, {token})
}

export async function listRemoteBranches(
  githubUrl: string,
  token?: string | null
): Promise<RemoteBranch[]> {
  const output = await gitNoCwd(['ls-remote', '--heads', githubUrl], 30_000, {token})
  if (!output) return []

  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [commitHash, ref] = line.split(/\s+/)
      return {commitHash, name: ref.replace('refs/heads/', '')}
    })
    .filter((branch) => branch.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function cloneRepository(
  githubUrl: string,
  localPath: string,
  token?: string | null
): Promise<void> {
  await gitNoCwd(['clone', '--no-tags', githubUrl, localPath], 120_000, {token})
}

export async function checkoutBranch(localPath: string, branch: string): Promise<void> {
  await git(['checkout', '-B', branch, `origin/${branch}`], localPath, 30_000)
}

export async function getHeadHash(localPath: string, branch: string): Promise<string> {
  return git(['rev-parse', `origin/${branch}`], localPath).catch(() =>
    git(['rev-parse', 'HEAD'], localPath)
  )
}

export async function getCommitsSince(
  localPath: string,
  branch: string,
  sinceHash: string | null
): Promise<CommitInfo[]> {
  const range = sinceHash ? `${sinceHash}..origin/${branch}` : `-50`
  const args = sinceHash
    ? ['log', range, '--format=%H|%h|%an|%ai|%s']
    : ['log', range, '--format=%H|%h|%an|%ai|%s']

  let output: string
  try {
    output = await git(args, localPath)
  } catch {
    return []
  }

  if (!output) return []

  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, author, date, ...msgParts] = line.split('|')
      return {hash, shortHash, author, date, message: msgParts.join('|')}
    })
}

export async function getDiff(
  repoId: string,
  repositoryBranchId: string,
  localPath: string,
  branch: string,
  fromHash: string | null,
  toHash: string
): Promise<DiffResult> {
  const range = fromHash ? `${fromHash}...${toHash}` : `${toHash}~10...${toHash}`

  const [stats, filesOutput] = await Promise.all([
    git(['diff', range, '--stat'], localPath).catch(() => ''),
    git(['diff', range, '--name-only'], localPath).catch(() => ''),
  ])

  const filesChanged = filesOutput.split('\n').filter(Boolean)

  let diff = await git(['diff', range], localPath).catch(() => '')

  if (Buffer.byteLength(diff) > config.maxDiffBytes) {
    diff = `[Diff truncated — ${filesChanged.length} files changed]\n\n${stats}`
  }

  const commits = await getCommitsSince(localPath, branch, fromHash)

  return {
    repoId,
    repositoryBranchId,
    repoPath: localPath,
    branch,
    commits,
    diff,
    filesChanged,
    stats,
    fromHash,
    toHash,
  }
}
