import {Router} from 'express'
import {getDb} from '../db/index.js'
import {ulid} from '../utils/ulid.js'
import type {Project} from '../types/index.js'

export const projectsRouter = Router()

projectsRouter.get('/', (_req, res) => {
  const db = getDb()
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Project[]
  res.json({data: projects.map(toDto)})
})

projectsRouter.post('/', (req, res) => {
  const {name, description = ''} = req.body as {name?: string; description?: string}
  if (!name?.trim()) return res.status(400).json({error: 'name is required'})

  const db = getDb()
  const id = ulid()
  db.prepare('INSERT INTO projects (id, name, description) VALUES (?, ?, ?)').run(
    id,
    name.trim(),
    description
  )
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project
  return res.status(201).json({data: toDto(project)})
})

projectsRouter.get('/:id', (req, res) => {
  const db = getDb()
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as
    | Project
    | undefined
  if (!project) return res.status(404).json({error: 'Project not found'})
  return res.json({data: toDto(project)})
})

projectsRouter.patch('/:id', (req, res) => {
  const db = getDb()
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as
    | Project
    | undefined
  if (!project) return res.status(404).json({error: 'Project not found'})

  const {name, description} = req.body as {name?: string; description?: string}
  db.prepare('UPDATE projects SET name = ?, description = ? WHERE id = ?').run(
    name?.trim() ?? project.name,
    description ?? project.description,
    req.params.id
  )
  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as Project
  return res.json({data: toDto(updated)})
})

projectsRouter.delete('/:id', (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id)
  res.json({data: {ok: true}})
})

function toDto(p: Project) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    createdAt: p.createdAt,
  }
}
