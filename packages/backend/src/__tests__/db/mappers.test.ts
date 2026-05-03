import {describe, it, expect} from 'vitest'
import {repoFromRow} from '../../db/mappers.js'

describe('repoFromRow', () => {
  it('maps snake_case columns to camelCase fields', () => {
    const row = {
      id: 'repo-1',
      project_id: 'proj-1',
      local_path: '/repos/myapp',
      github_url: 'https://github.com/org/myapp',
      github_token: null,
      github_credential_id: null,
      source_type: 'local_path',
      branch: 'main',
      last_fetched_at: '2024-06-01 12:00:00',
      last_analyzed_commit_hash: 'abc1234',
    }

    expect(repoFromRow(row)).toEqual({
      id: 'repo-1',
      projectId: 'proj-1',
      localPath: '/repos/myapp',
      githubUrl: 'https://github.com/org/myapp',
      githubToken: null,
      githubCredentialId: null,
      hasAuthToken: false,
      sourceType: 'local_path',
      branch: 'main',
      lastFetchedAt: '2024-06-01T12:00:00Z',
      lastAnalyzedCommitHash: 'abc1234',
    })
  })

  it('maps null optional fields to null (not undefined)', () => {
    const row = {
      id: 'repo-2',
      project_id: 'proj-1',
      local_path: '/repos/other',
      github_url: null,
      github_token: null,
      github_credential_id: null,
      source_type: 'local_path',
      branch: 'develop',
      last_fetched_at: null,
      last_analyzed_commit_hash: null,
    }

    const result = repoFromRow(row)

    expect(result.githubUrl).toBeNull()
    expect(result.githubToken).toBeNull()
    expect(result.hasAuthToken).toBe(false)
    expect(result.lastFetchedAt).toBeNull()
    expect(result.lastAnalyzedCommitHash).toBeNull()
  })
})
