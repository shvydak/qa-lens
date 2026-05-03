import {describe, it, expect, vi, beforeEach} from 'vitest'
import request from 'supertest'
import type Database from 'better-sqlite3'
import {existsSync, mkdirSync, rmSync} from 'fs'
import {join} from 'path'
import {config} from '../../config.js'
import {createTestDb, seedProject, seedRepo, seedTestSet} from '../helpers/db.js'

const gitMocks = vi.hoisted(() => ({
  getCommitsSince: vi.fn(),
  validateRepo: vi.fn(),
  fetchOrigin: vi.fn(),
  listRemoteBranches: vi.fn(),
  cloneRepository: vi.fn(),
  checkoutBranch: vi.fn(),
}))

let testDb: Database.Database

vi.mock('../../db/index.js', () => ({
  getDb: () => testDb,
}))

vi.mock('../../services/GitService.js', () => gitMocks)

import {createTestApp} from '../helpers/app.js'

beforeEach(() => {
  testDb = createTestDb()
  vi.clearAllMocks()
})

describe('POST /api/repos/:repoId/sync-branches', () => {
  it('marks missing tracked branches and returns untracked remote branches', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1'})
    testDb
      .prepare('UPDATE repositories SET github_url = ? WHERE id = ?')
      .run('https://github.com/org/repo', 'repo-1')
    testDb
      .prepare(
        `
        INSERT INTO repository_branches (id, repository_id, name, status, is_active)
        VALUES (?, ?, ?, 'active', 0)
      `
      )
      .run('repo-1-develop', 'repo-1', 'develop')
    gitMocks.listRemoteBranches.mockResolvedValue([
      {name: 'main', commitHash: 'main-hash'},
      {name: 'feature/payment-fix', commitHash: 'feature-hash'},
    ])

    const res = await request(app).post('/api/repos/repo-1/sync-branches').send({})

    expect(res.status).toBe(200)
    expect(res.body.data.untrackedBranches).toEqual([
      {name: 'feature/payment-fix', commitHash: 'feature-hash'},
    ])
    expect(res.body.data.repo.branches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({name: 'main', status: 'active'}),
        expect.objectContaining({name: 'develop', status: 'missing'}),
      ])
    )
    expect(gitMocks.listRemoteBranches).toHaveBeenCalledWith('https://github.com/org/repo', null)
  })
})

describe('POST /api/repos/:repoId/branches', () => {
  it('tracks a remote branch discovered from GitHub', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1'})
    testDb
      .prepare('UPDATE repositories SET github_url = ? WHERE id = ?')
      .run('https://github.com/org/repo', 'repo-1')
    gitMocks.listRemoteBranches.mockResolvedValue([
      {name: 'main', commitHash: 'main-hash'},
      {name: 'feature/payment-fix', commitHash: 'feature-hash'},
    ])

    const res = await request(app)
      .post('/api/repos/repo-1/branches')
      .send({branchName: 'feature/payment-fix'})

    expect(res.status).toBe(201)
    expect(res.body.data.branches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({name: 'feature/payment-fix', status: 'active', isActive: false}),
      ])
    )
  })
})

const app = createTestApp()

describe('POST /api/projects/:projectId/repos/credentials', () => {
  it('creates a project credential without returning the token', async () => {
    const projectId = seedProject(testDb)

    const res = await request(app)
      .post(`/api/projects/${projectId}/repos/credentials`)
      .send({name: 'ProBuild GitHub', token: 'secret-token'})

    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({
      projectId,
      name: 'ProBuild GitHub',
      hasToken: true,
    })
    expect(res.body.data.token).toBeUndefined()

    const row = testDb
      .prepare('SELECT token FROM github_credentials WHERE id = ?')
      .get(res.body.data.id) as {token: string} | undefined
    expect(row?.token).toBe('secret-token')
  })
})

describe('POST /api/projects/:projectId/repos/discover-branches', () => {
  it('passes the optional GitHub token to branch discovery', async () => {
    const projectId = seedProject(testDb)
    gitMocks.listRemoteBranches.mockResolvedValue([{name: 'main', commitHash: 'main-hash'}])

    const res = await request(app)
      .post(`/api/projects/${projectId}/repos/discover-branches`)
      .send({githubUrl: 'https://github.com/org/repo', githubToken: 'secret-token'})

    expect(res.status).toBe(200)
    expect(res.body.data.branches).toEqual([{name: 'main', commitHash: 'main-hash'}])
    expect(gitMocks.listRemoteBranches).toHaveBeenCalledWith(
      'https://github.com/org/repo',
      'secret-token'
    )
  })

  it('uses a saved credential for branch discovery', async () => {
    const projectId = seedProject(testDb)
    testDb
      .prepare('INSERT INTO github_credentials (id, project_id, name, token) VALUES (?, ?, ?, ?)')
      .run('cred-1', projectId, 'ProBuild GitHub', 'saved-token')
    gitMocks.listRemoteBranches.mockResolvedValue([{name: 'staging', commitHash: 'staging-hash'}])

    const res = await request(app)
      .post(`/api/projects/${projectId}/repos/discover-branches`)
      .send({githubUrl: 'https://github.com/org/repo', githubCredentialId: 'cred-1'})

    expect(res.status).toBe(200)
    expect(gitMocks.listRemoteBranches).toHaveBeenCalledWith(
      'https://github.com/org/repo',
      'saved-token'
    )
  })
})

describe('POST /api/projects/:projectId/repos', () => {
  it('rejects direct local path repositories', async () => {
    const projectId = seedProject(testDb)

    const res = await request(app)
      .post(`/api/projects/${projectId}/repos`)
      .send({localPath: '/tmp/repo', branchNames: ['main']})

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('githubUrl is required')
    expect(gitMocks.validateRepo).not.toHaveBeenCalled()
  })

  it('stores the token for managed clones without returning it in the response', async () => {
    const projectId = seedProject(testDb)
    gitMocks.cloneRepository.mockResolvedValue(undefined)
    gitMocks.fetchOrigin.mockResolvedValue(undefined)
    gitMocks.checkoutBranch.mockResolvedValue(undefined)

    const res = await request(app)
      .post(`/api/projects/${projectId}/repos`)
      .send({
        githubUrl: 'https://github.com/org/repo',
        githubToken: 'secret-token',
        branchNames: ['main'],
      })

    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({
      githubUrl: 'https://github.com/org/repo',
      hasAuthToken: true,
    })
    expect(res.body.data.githubToken).toBeUndefined()
    expect(gitMocks.cloneRepository).toHaveBeenCalledWith(
      'https://github.com/org/repo',
      expect.any(String),
      'secret-token'
    )
    expect(gitMocks.fetchOrigin).toHaveBeenCalledWith(expect.any(String), 'main', 'secret-token')

    const row = testDb
      .prepare('SELECT github_token FROM repositories WHERE id = ?')
      .get(res.body.data.id) as {github_token: string} | undefined
    expect(row?.github_token).toBe('secret-token')
  })

  it('cleans up the managed clone folder when setup fails', async () => {
    const projectId = seedProject(testDb)
    let clonedPath = ''
    gitMocks.cloneRepository.mockImplementation(async (_url: string, localPath: string) => {
      clonedPath = localPath
      mkdirSync(localPath, {recursive: true})
    })
    gitMocks.fetchOrigin.mockRejectedValue(new Error('fetch failed'))

    const res = await request(app)
      .post(`/api/projects/${projectId}/repos`)
      .send({
        githubUrl: 'https://github.com/org/repo',
        branchNames: ['main'],
      })

    expect(res.status).toBe(400)
    expect(clonedPath).not.toBe('')
    expect(existsSync(clonedPath)).toBe(false)
  })

  it('uses a saved credential when creating a managed clone', async () => {
    const projectId = seedProject(testDb)
    testDb
      .prepare('INSERT INTO github_credentials (id, project_id, name, token) VALUES (?, ?, ?, ?)')
      .run('cred-1', projectId, 'ProBuild GitHub', 'saved-token')
    gitMocks.cloneRepository.mockResolvedValue(undefined)
    gitMocks.fetchOrigin.mockResolvedValue(undefined)
    gitMocks.checkoutBranch.mockResolvedValue(undefined)

    const res = await request(app)
      .post(`/api/projects/${projectId}/repos`)
      .send({
        githubUrl: 'https://github.com/org/repo',
        githubCredentialId: 'cred-1',
        branchNames: ['staging'],
      })

    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({githubCredentialId: 'cred-1', hasAuthToken: true})
    expect(res.body.data.githubToken).toBeUndefined()
    expect(gitMocks.cloneRepository).toHaveBeenCalledWith(
      'https://github.com/org/repo',
      expect.any(String),
      'saved-token'
    )
    expect(gitMocks.fetchOrigin).toHaveBeenCalledWith(expect.any(String), 'staging', 'saved-token')
  })
})

describe('DELETE /api/repos/:repoId', () => {
  it('returns 404 for an unknown repository', async () => {
    const res = await request(app).delete('/api/repos/missing-repo')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Repository not found')
  })

  it('deletes an unused managed clone folder from disk', async () => {
    const projectId = seedProject(testDb)
    const repoPath = join(config.managedReposPath, 'delete-managed-repo-test')
    rmSync(repoPath, {recursive: true, force: true})
    mkdirSync(repoPath, {recursive: true})
    seedRepo(testDb, projectId, {id: 'repo-managed', localPath: repoPath})
    testDb
      .prepare("UPDATE repositories SET source_type = 'managed_clone', github_url = ? WHERE id = ?")
      .run('https://github.com/org/repo', 'repo-managed')

    const res = await request(app).delete('/api/repos/repo-managed')

    expect(res.status).toBe(200)
    expect(existsSync(repoPath)).toBe(false)
  })

  it('keeps a managed clone folder if another repository still references it', async () => {
    const projectId = seedProject(testDb)
    const otherProjectId = seedProject(testDb, 'proj-2', 'Other Project')
    const repoPath = join(config.managedReposPath, 'shared-managed-repo-test')
    rmSync(repoPath, {recursive: true, force: true})
    mkdirSync(repoPath, {recursive: true})
    seedRepo(testDb, projectId, {id: 'repo-managed-1', localPath: repoPath})
    seedRepo(testDb, otherProjectId, {id: 'repo-managed-2', localPath: repoPath})
    testDb
      .prepare(
        "UPDATE repositories SET source_type = 'managed_clone', github_url = ? WHERE id IN (?, ?)"
      )
      .run('https://github.com/org/repo', 'repo-managed-1', 'repo-managed-2')

    const res = await request(app).delete('/api/repos/repo-managed-1')

    expect(res.status).toBe(200)
    expect(existsSync(repoPath)).toBe(true)
    rmSync(repoPath, {recursive: true, force: true})
  })

  it('does not delete managed clone paths outside the managed repos directory', async () => {
    const projectId = seedProject(testDb)
    const repoPath = join(config.managedReposPath, '..', 'outside-managed-repo-test')
    rmSync(repoPath, {recursive: true, force: true})
    mkdirSync(repoPath, {recursive: true})
    seedRepo(testDb, projectId, {id: 'repo-outside-managed', localPath: repoPath})
    testDb
      .prepare("UPDATE repositories SET source_type = 'managed_clone', github_url = ? WHERE id = ?")
      .run('https://github.com/org/repo', 'repo-outside-managed')

    const res = await request(app).delete('/api/repos/repo-outside-managed')

    expect(res.status).toBe(200)
    expect(existsSync(repoPath)).toBe(true)
    rmSync(repoPath, {recursive: true, force: true})
  })
})

describe('POST /api/repos/:repoId/fetch', () => {
  it('uses the saved GitHub token when fetching the active branch', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1'})
    testDb
      .prepare('UPDATE repositories SET github_url = ?, github_token = ? WHERE id = ?')
      .run('https://github.com/org/repo', 'secret-token', 'repo-1')
    gitMocks.listRemoteBranches.mockResolvedValue([{name: 'main', commitHash: 'main-hash'}])
    gitMocks.fetchOrigin.mockResolvedValue(undefined)
    gitMocks.getCommitsSince.mockResolvedValue([])

    const res = await request(app).post('/api/repos/repo-1/fetch').send({})

    expect(res.status).toBe(200)
    expect(gitMocks.fetchOrigin).toHaveBeenCalledWith('/fake/path', 'main', 'secret-token')
  })
})

describe('PATCH /api/repos/:repoId/active-branch', () => {
  it('does not activate a missing branch', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1'})
    testDb
      .prepare(
        `
        INSERT INTO repository_branches (id, repository_id, name, status, is_active)
        VALUES (?, ?, ?, 'missing', 0)
      `
      )
      .run('repo-1-missing', 'repo-1', 'feature/deleted')

    const res = await request(app)
      .patch('/api/repos/repo-1/active-branch')
      .send({branchId: 'repo-1-missing'})

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Cannot activate a branch that is not active in remote')
  })
})

describe('PATCH /api/repos/:repoId/branches/:branchId', () => {
  it('does not archive the active branch', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1'})

    const res = await request(app)
      .patch('/api/repos/repo-1/branches/repo-1-branch')
      .send({status: 'archived'})

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Cannot archive the active branch')
  })
})

describe('GET /api/projects/:projectId/repos', () => {
  it('counts commits from the active test set cursor when one exists', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1', lastAnalyzedCommitHash: 'baseline-hash'})
    seedTestSet(testDb, projectId, {
      commitRanges: {'repo-1': {from: 'baseline-hash', to: 'active-head'}},
    })
    gitMocks.getCommitsSince.mockResolvedValue([{hash: 'new-1'}, {hash: 'new-2'}])

    const res = await request(app).get(`/api/projects/${projectId}/repos`)

    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({
      id: 'repo-1',
      unanalyzedCount: 2,
      analysisCursor: 'active',
    })
    expect(gitMocks.getCommitsSince).toHaveBeenCalledWith('/fake/path', 'main', 'active-head')
  })

  it('falls back to the last passed analysis cursor when there is no active test set', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1', lastAnalyzedCommitHash: 'baseline-hash'})
    gitMocks.getCommitsSince.mockResolvedValue([{hash: 'new-1'}])

    const res = await request(app).get(`/api/projects/${projectId}/repos`)

    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({
      unanalyzedCount: 1,
      analysisCursor: 'baseline',
    })
    expect(gitMocks.getCommitsSince).toHaveBeenCalledWith('/fake/path', 'main', 'baseline-hash')
  })

  it('marks repositories without any cursor as needing an initial analysis', async () => {
    const projectId = seedProject(testDb)
    seedRepo(testDb, projectId, {id: 'repo-1', lastAnalyzedCommitHash: null})
    gitMocks.getCommitsSince.mockResolvedValue([{hash: 'latest'}])

    const res = await request(app).get(`/api/projects/${projectId}/repos`)

    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({
      unanalyzedCount: 1,
      analysisCursor: 'none',
    })
    expect(gitMocks.getCommitsSince).toHaveBeenCalledWith('/fake/path', 'main', null)
  })
})
