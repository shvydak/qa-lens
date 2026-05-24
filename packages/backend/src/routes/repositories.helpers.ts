import {getDb} from '../db/index.js'
import {repoBranchFromRow} from '../db/mappers.js'
import {ulid} from '../utils/ulid.js'
import * as GitService from '../services/GitService.js'
import type {Repository, RepositoryBranch} from '../types/index.js'

export type CommitRanges = Record<string, {from: string | null; to: string}>

export function getRepoBranches(repositoryId: string): RepositoryBranch[] {
  const db = getDb()
  return db
    .prepare(
      'SELECT * FROM repository_branches WHERE repository_id = ? ORDER BY is_active DESC, name'
    )
    .all(repositoryId)
    .map(repoBranchFromRow)
}

export function getCredentialToken(projectId: string, credentialId?: string | null): string | null {
  if (!credentialId?.trim()) return null
  const row = getDb()
    .prepare(
      'SELECT token FROM github_credentials WHERE id = ? AND (project_id = ? OR project_id IS NULL)'
    )
    .get(credentialId.trim(), projectId) as {token: string} | undefined
  return row?.token ?? null
}

export function getActiveBranch(
  branches: RepositoryBranch[],
  repo: Repository
): RepositoryBranch | null {
  return (
    branches.find((branch) => branch.isActive) ??
    branches.find((branch) => branch.name === repo.branch) ??
    branches[0] ??
    null
  )
}

export function insertBranches(
  repositoryId: string,
  branchNames: string[],
  activeBranchName: string
): void {
  const db = getDb()
  const insertBranch = db.prepare(`
    INSERT INTO repository_branches (id, repository_id, name, status, is_active)
    VALUES (?, ?, ?, 'active', ?)
  `)

  for (const name of branchNames) {
    insertBranch.run(ulid(), repositoryId, name, name === activeBranchName ? 1 : 0)
  }
}

export async function syncTrackedBranchStatuses(
  repo: Repository
): Promise<GitService.RemoteBranch[]> {
  if (!repo.githubUrl) return []

  const remoteBranches = await GitService.listRemoteBranches(repo.githubUrl, repo.githubToken)
  const remoteNames = new Set(remoteBranches.map((branch) => branch.name))
  const db = getDb()
  const branches = getRepoBranches(repo.id)
  const updateStatus = db.prepare('UPDATE repository_branches SET status = ? WHERE id = ?')

  for (const branch of branches) {
    if (branch.status === 'archived') continue
    updateStatus.run(remoteNames.has(branch.name) ? 'active' : 'missing', branch.id)
  }

  return remoteBranches
}

export function normalizeBranchNames(branchNames: string[]): string[] {
  return [...new Set(branchNames.map((name) => name.trim()).filter(Boolean))]
}

export function safeRepoSlug(githubUrl: string): string {
  const withoutGitSuffix = githubUrl.replace(/\.git$/, '')
  const parts = withoutGitSuffix.split(/[/:]/).filter(Boolean)
  return (parts.slice(-2).join('-') || 'repo').replace(/[^a-zA-Z0-9._-]/g, '-')
}

export function commitUrl(githubUrl: string | null, hash: string): string | null {
  if (!githubUrl || !hash) return null
  const match = githubUrl.match(/github\.com[:/]([^/:\s]+)\/([^/\s]+?)(?:\.git)?$/)
  if (!match) return null
  const [, owner, repo] = match
  return `https://github.com/${owner}/${repo}/commit/${hash}`
}

export function repoToDto(
  r: Repository,
  branches: RepositoryBranch[] = [],
  activeBranch?: RepositoryBranch | null
) {
  return {
    id: r.id,
    projectId: r.projectId,
    localPath: r.localPath,
    githubUrl: r.githubUrl,
    githubCredentialId: r.githubCredentialId,
    hasAuthToken: Boolean(r.githubToken),
    sourceType: r.sourceType,
    branch: activeBranch?.name ?? r.branch,
    branches,
    activeBranch: activeBranch ?? null,
    lastFetchedAt: activeBranch?.lastFetchedAt ?? r.lastFetchedAt,
    lastAnalyzedCommitHash: activeBranch?.lastAnalyzedCommitHash ?? r.lastAnalyzedCommitHash,
  }
}
