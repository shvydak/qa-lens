import {describe, it, expect} from 'vitest'
import {
  attachmentToDto,
  credentialToDto,
  projectFromRow,
  repoFromRow,
  testToDto,
} from '../../db/mappers.js'

describe('projectFromRow', () => {
  it('maps created_at to a camelCase ISO timestamp', () => {
    const result = projectFromRow({
      id: 'proj-1',
      name: 'Alpha',
      description: 'desc',
      created_at: '2024-06-01 12:00:00',
    })

    expect(result).toEqual({
      id: 'proj-1',
      name: 'Alpha',
      description: 'desc',
      createdAt: '2024-06-01T12:00:00Z',
    })
  })
})

describe('credentialToDto', () => {
  it('exposes has_token without leaking the token value', () => {
    const dto = credentialToDto({
      id: 'cred-1',
      project_id: null,
      name: 'global',
      has_token: 1,
      created_at: '2024-06-01 12:00:00',
    })

    expect(dto).toEqual({
      id: 'cred-1',
      projectId: null,
      scope: 'global',
      name: 'global',
      hasToken: true,
      createdAt: '2024-06-01T12:00:00Z',
    })
  })
})

describe('attachmentToDto', () => {
  it('maps snake_case fields and normalizes created_at to ISO Z', () => {
    const dto = attachmentToDto({
      id: 'att-1',
      test_id: 'test-1',
      filename: 'screenshot.png',
      created_at: '2024-06-01 12:00:00',
    })

    expect(dto).toEqual({
      id: 'att-1',
      testId: 'test-1',
      filename: 'screenshot.png',
      createdAt: '2024-06-01T12:00:00Z',
    })
  })
})

describe('testToDto', () => {
  it('parses JSON array columns into string arrays', () => {
    const dto = testToDto({
      id: 't-1',
      test_set_id: 'ts-1',
      description: 'do thing',
      preconditions: '["logged in"]',
      steps: '["step 1","step 2"]',
      status: 'not_tested',
      source: 'ai',
      sort_order: 0,
    })

    expect(dto.preconditions).toEqual(['logged in'])
    expect(dto.steps).toEqual(['step 1', 'step 2'])
  })
})

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
