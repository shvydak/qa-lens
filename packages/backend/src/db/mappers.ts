import type {Project, Repository, RepositoryBranch} from '../types/index.js'
import {parseStringArray} from '../utils/json.js'

export function sqliteUtcToIso(value: string | null): string | null {
  if (!value) return null
  return value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
}

export function projectFromRow(row: unknown): Project {
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? '',
    createdAt: sqliteUtcToIso((r.created_at as string | null) ?? null) ?? '',
  }
}

export function repoFromRow(row: unknown): Repository {
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    localPath: r.local_path as string,
    githubUrl: (r.github_url as string | null) ?? null,
    githubToken: (r.github_token as string | null) ?? null,
    githubCredentialId: (r.github_credential_id as string | null) ?? null,
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

export function testToDto(row: unknown) {
  const r = row as Record<string, unknown>
  return {
    id: r.id,
    testSetId: r.test_set_id,
    description: r.description,
    title: r.title ?? null,
    priority: r.priority,
    area: r.area ?? null,
    userScenario: r.user_scenario ?? null,
    preconditions: parseStringArray(r.preconditions),
    steps: parseStringArray(r.steps),
    expectedResult: r.expected_result ?? null,
    risk: r.risk ?? null,
    technicalContext: r.technical_context ?? null,
    analysisRunId: r.analysis_run_id ?? null,
    repositoryBranchId: r.repository_branch_id ?? null,
    status: r.status,
    source: r.source,
    sortOrder: r.sort_order,
    note: (r.note as string | null) ?? null,
  }
}

export function attachmentToDto(row: unknown) {
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    testId: r.test_id as string,
    filename: r.filename as string,
    createdAt: sqliteUtcToIso((r.created_at as string | null) ?? null) ?? '',
  }
}

export function credentialToDto(row: unknown) {
  const r = row as Record<string, unknown>
  return {
    id: r.id,
    projectId: r.project_id ?? null,
    scope: r.project_id ? 'project' : 'global',
    name: r.name,
    hasToken: Boolean(r.has_token ?? r.token),
    createdAt: sqliteUtcToIso((r.created_at as string | null) ?? null),
  }
}
