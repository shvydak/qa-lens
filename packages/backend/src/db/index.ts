import Database from 'better-sqlite3'
import {readFileSync} from 'fs'
import {fileURLToPath} from 'url'
import {dirname, join} from 'path'
import {config} from '../config.js'
import {ulid} from '../utils/ulid.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(config.dbPath)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    runMigrations(_db)
  }
  return _db
}

function runMigrations(db: Database.Database): void {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
  db.exec(schema)
  ensureColumn(db, 'repositories', 'github_token', 'TEXT')
  ensureColumn(db, 'repositories', 'github_credential_id', 'TEXT')
  ensureColumn(db, 'repositories', 'source_type', "TEXT NOT NULL DEFAULT 'local_path'")
  ensureColumn(db, 'test_sets', 'analysis_context_id', 'TEXT')
  ensureColumn(db, 'tests', 'title', 'TEXT')
  ensureColumn(db, 'tests', 'user_scenario', 'TEXT')
  ensureColumn(db, 'tests', 'preconditions', 'TEXT')
  ensureColumn(db, 'tests', 'steps', 'TEXT')
  ensureColumn(db, 'tests', 'expected_result', 'TEXT')
  ensureColumn(db, 'tests', 'risk', 'TEXT')
  ensureColumn(db, 'tests', 'technical_context', 'TEXT')
  ensureColumn(db, 'tests', 'analysis_run_id', 'TEXT')
  ensureColumn(db, 'tests', 'repository_branch_id', 'TEXT')
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_test_sets_context ON test_sets(analysis_context_id);
    CREATE INDEX IF NOT EXISTS idx_tests_analysis_run ON tests(analysis_run_id);
  `)
  backfillRepositoryBranches(db)
}

function ensureColumn(
  db: Database.Database,
  tableName: string,
  columnName: string,
  columnType: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{name: string}>
  if (columns.some((column) => column.name === columnName)) return

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`)
}

function backfillRepositoryBranches(db: Database.Database): void {
  const repos = db.prepare('SELECT * FROM repositories').all() as Array<{
    id: string
    branch: string
    last_fetched_at: string | null
    last_analyzed_commit_hash: string | null
  }>
  const insertBranch = db.prepare(`
    INSERT OR IGNORE INTO repository_branches (
      id,
      repository_id,
      name,
      status,
      is_active,
      last_fetched_at,
      last_analyzed_commit_hash
    )
    VALUES (?, ?, ?, 'active', 1, ?, ?)
  `)

  for (const repo of repos) {
    const existing = db
      .prepare('SELECT id FROM repository_branches WHERE repository_id = ? LIMIT 1')
      .get(repo.id)
    if (existing) continue

    insertBranch.run(
      ulid(),
      repo.id,
      repo.branch || 'main',
      repo.last_fetched_at,
      repo.last_analyzed_commit_hash
    )
  }
}
