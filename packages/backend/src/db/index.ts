import Database from 'better-sqlite3'
import {readFileSync} from 'fs'
import {fileURLToPath} from 'url'
import {dirname, join} from 'path'
import {config} from '../config.js'

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
}
