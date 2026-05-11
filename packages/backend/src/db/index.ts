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
  relaxGitHubCredentialsProjectId(db)
  ensureColumn(db, 'repositories', 'github_token', 'TEXT')
  ensureColumn(db, 'repositories', 'github_credential_id', 'TEXT')
  ensureColumn(db, 'repositories', 'source_type', "TEXT NOT NULL DEFAULT 'local_path'")
  ensureColumn(db, 'test_sets', 'analysis_context_id', 'TEXT')
  ensureColumn(db, 'test_sets', 'is_empty_review', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'test_sets', 'resolution_note', 'TEXT')
  allowNotRequiredTestSetStatus(db)
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

function allowNotRequiredTestSetStatus(db: Database.Database): void {
  const table = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'test_sets'")
    .get() as {sql: string} | undefined

  if (!table?.sql || (table.sql.includes("'not_required'") && table.sql.includes("'reviewed'"))) {
    return
  }

  db.pragma('foreign_keys = OFF')
  try {
    db.exec(`
      CREATE TABLE test_sets_new (
        id            TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        analysis_context_id TEXT REFERENCES analysis_contexts(id) ON DELETE SET NULL,
        name          TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','passed','failed','reviewed','not_required')),
        commit_ranges TEXT NOT NULL DEFAULT '{}',
        ai_summary    TEXT,
        regressions   TEXT,
        cross_impacts TEXT,
        is_empty_review INTEGER NOT NULL DEFAULT 0,
        resolution_note TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at  TEXT
      );
      INSERT INTO test_sets_new (
        id,
        project_id,
        analysis_context_id,
        name,
        status,
        commit_ranges,
        ai_summary,
        regressions,
        cross_impacts,
        is_empty_review,
        resolution_note,
        created_at,
        completed_at
      )
        SELECT
          id,
          project_id,
          analysis_context_id,
          name,
          status,
          commit_ranges,
          ai_summary,
          regressions,
          cross_impacts,
          is_empty_review,
          resolution_note,
          created_at,
          completed_at
        FROM test_sets;
      DROP TABLE test_sets;
      ALTER TABLE test_sets_new RENAME TO test_sets;
      CREATE INDEX IF NOT EXISTS idx_test_sets_project ON test_sets(project_id);
      CREATE INDEX IF NOT EXISTS idx_test_sets_context ON test_sets(analysis_context_id);
    `)
  } finally {
    db.pragma('foreign_keys = ON')
  }
}

function relaxGitHubCredentialsProjectId(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(github_credentials)').all() as Array<{
    name: string
    notnull: number
  }>
  const projectIdColumn = columns.find((column) => column.name === 'project_id')
  if (!projectIdColumn || projectIdColumn.notnull === 0) return

  db.exec(`
    CREATE TABLE github_credentials_new (
      id         TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      token      TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, name)
    );
    INSERT INTO github_credentials_new (id, project_id, name, token, created_at)
      SELECT id, project_id, name, token, created_at FROM github_credentials;
    DROP TABLE github_credentials;
    ALTER TABLE github_credentials_new RENAME TO github_credentials;
    CREATE INDEX IF NOT EXISTS idx_credentials_project ON github_credentials(project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_global_name ON github_credentials(name) WHERE project_id IS NULL;
  `)
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
