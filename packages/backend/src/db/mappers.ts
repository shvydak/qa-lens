import type {Repository, RepositoryBranch} from '../types/index.js'

function sqliteUtcToIso(value: string | null): string | null {
  if (!value) return null
  return value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
}

export function repoFromRow(row: unknown): Repository {
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    localPath: r.local_path as string,
    githubUrl: (r.github_url as string | null) ?? null,
    githubToken: (r.github_token as string | null) ?? null,
    hasAuthToken: Boolean(r.github_token),
    sourceType: ((r.source_type as string | null) ?? 'local_path') as Repository['sourceType'],
    branch: r.branch as string,
    lastFetchedAt: sqliteUtcToIso((r.last_fetched_at as string | null) ?? null),
    lastAnalyzedCommitHash: (r.last_analyzed_commit_hash as string | null) ?? null,
  }
}

export function repoBranchFromRow(row: unknown): RepositoryBranch {
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    repositoryId: r.repository_id as string,
    name: r.name as string,
    status: r.status as RepositoryBranch['status'],
    isActive: Boolean(r.is_active),
    lastFetchedAt: sqliteUtcToIso((r.last_fetched_at as string | null) ?? null),
    lastAnalyzedCommitHash: (r.last_analyzed_commit_hash as string | null) ?? null,
  }
}
