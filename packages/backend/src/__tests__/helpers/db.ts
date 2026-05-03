import Database from 'better-sqlite3'
import {readFileSync} from 'fs'
import {fileURLToPath} from 'url'
import {dirname, join} from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  const schema = readFileSync(join(__dirname, '../../db/schema.sql'), 'utf-8')
  db.exec(schema)
  return db
}

export function seedProject(db: Database.Database, id = 'proj-1', name = 'Test Project'): string {
  db.prepare('INSERT INTO projects (id, name, description) VALUES (?, ?, ?)').run(id, name, '')
  return id
}

export function seedRepo(
  db: Database.Database,
  projectId: string,
  opts: {
    id?: string
    localPath?: string
    branch?: string
    lastAnalyzedCommitHash?: string | null
  } = {}
): string {
  const id = opts.id ?? 'repo-1'
  db.prepare(
    'INSERT INTO repositories (id, project_id, local_path, branch, last_analyzed_commit_hash) VALUES (?, ?, ?, ?, ?)'
  ).run(
    id,
    projectId,
    opts.localPath ?? '/fake/path',
    opts.branch ?? 'main',
    opts.lastAnalyzedCommitHash ?? null
  )
  db.prepare(
    `
    INSERT INTO repository_branches (
      id,
      repository_id,
      name,
      status,
      is_active,
      last_analyzed_commit_hash
    )
    VALUES (?, ?, ?, 'active', 1, ?)
  `
  ).run(`${id}-branch`, id, opts.branch ?? 'main', opts.lastAnalyzedCommitHash ?? null)
  return id
}

export function seedTestSet(
  db: Database.Database,
  projectId: string,
  opts: {
    id?: string
    status?: string
    commitRanges?: Record<string, {from: string | null; to: string}>
  } = {}
): string {
  const id = opts.id ?? 'ts-1'
  db.prepare(
    'INSERT INTO test_sets (id, project_id, name, status, commit_ranges) VALUES (?, ?, ?, ?, ?)'
  ).run(id, projectId, 'Test Set', opts.status ?? 'active', JSON.stringify(opts.commitRanges ?? {}))
  return id
}
