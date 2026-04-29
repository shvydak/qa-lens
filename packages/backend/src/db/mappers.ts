import type { Repository } from '../types/index.js'

export function repoFromRow(row: unknown): Repository {
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    localPath: r.local_path as string,
    githubUrl: (r.github_url as string | null) ?? null,
    branch: r.branch as string,
    lastFetchedAt: (r.last_fetched_at as string | null) ?? null,
    lastAnalyzedCommitHash: (r.last_analyzed_commit_hash as string | null) ?? null,
  }
}
