import {describe, it, expect, vi, beforeEach} from 'vitest'
import request from 'supertest'
import type Database from 'better-sqlite3'
import {createTestDb, seedProject} from '../helpers/db.js'

let testDb: Database.Database

vi.mock('../../db/index.js', () => ({
  getDb: () => testDb,
}))

import {createTestApp} from '../helpers/app.js'

beforeEach(() => {
  testDb = createTestDb()
})

const app = createTestApp()

describe('POST /api/projects', () => {
  it('creates a project and returns 201', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({name: 'My App', description: 'E2E suite'})

    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({name: 'My App', description: 'E2E suite'})
    expect(res.body.data.id).toBeDefined()
  })

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/projects').send({description: 'No name'})
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 when name is blank', async () => {
    const res = await request(app).post('/api/projects').send({name: '   '})
    expect(res.status).toBe(400)
  })
})

describe('GET /api/projects', () => {
  it('returns all projects', async () => {
    seedProject(testDb, 'proj-1', 'Alpha')
    seedProject(testDb, 'proj-2', 'Beta')

    const res = await request(app).get('/api/projects')

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })

  it('returns empty array when no projects', async () => {
    const res = await request(app).get('/api/projects')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })
})

describe('GET /api/projects/:id', () => {
  it('returns the project', async () => {
    const projectId = seedProject(testDb, 'proj-1', 'Alpha')

    const res = await request(app).get(`/api/projects/${projectId}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({id: projectId, name: 'Alpha'})
  })

  it('returns 404 for non-existent project', async () => {
    const res = await request(app).get('/api/projects/nonexistent')
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/projects/:id', () => {
  it('updates name and description', async () => {
    const projectId = seedProject(testDb)

    const res = await request(app)
      .patch(`/api/projects/${projectId}`)
      .send({name: 'Updated', description: 'New desc'})

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({name: 'Updated', description: 'New desc'})
  })

  it('returns 404 for non-existent project', async () => {
    const res = await request(app).patch('/api/projects/nonexistent').send({name: 'X'})
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/projects/:id', () => {
  it('deletes the project', async () => {
    const projectId = seedProject(testDb)

    const res = await request(app).delete(`/api/projects/${projectId}`)

    expect(res.status).toBe(200)
    expect(res.body.data.ok).toBe(true)

    const check = await request(app).get(`/api/projects/${projectId}`)
    expect(check.status).toBe(404)
  })
})
