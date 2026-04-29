import {execFile} from 'child_process'
import {promisify} from 'util'
import type {CommitInfo, DiffResult} from '../types/index.js'
import {config} from '../config.js'

const execFileAsync = promisify(execFile)

async function git(args: string[], cwd: string, timeout = 30_000): Promise<string> {
  const {stdout} = await execFileAsync('git', args, {cwd, timeout, maxBuffer: 20 * 1024 * 1024})
  return stdout.trim()
}

export async function validateRepo(localPath: string): Promise<{valid: boolean; error?: string}> {
  try {
    await git(['rev-parse', '--git-dir'], localPath)
    return {valid: true}
  } catch {
    return {valid: false, error: 'Not a valid git repository'}
  }
}

export async function fetchOrigin(localPath: string, branch: string): Promise<void> {
  await git(['fetch', 'origin', branch, '--prune'], localPath, 30_000)
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

  return {repoId, repoPath: localPath, branch, commits, diff, filesChanged, stats, fromHash, toHash}
}
