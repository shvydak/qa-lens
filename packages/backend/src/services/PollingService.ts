import {getDb} from '../db/index.js'
import {repoFromRow} from '../db/mappers.js'
import * as GitService from './GitService.js'
import {config} from '../config.js'

let intervalId: ReturnType<typeof setInterval> | null = null

export function start(): void {
  if (intervalId) return
  intervalId = setInterval(fetchAll, config.gitFetchIntervalMs)
  fetchAll()
}

export function stop(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

async function fetchAll(): Promise<void> {
  const db = getDb()
  const repoRows = db.prepare('SELECT * FROM repositories').all()
  const repos = repoRows.map(repoFromRow)

  await Promise.allSettled(
    repos.map(async (repo) => {
      try {
        await GitService.fetchOrigin(repo.localPath, repo.branch)
        db.prepare("UPDATE repositories SET last_fetched_at = datetime('now') WHERE id = ?").run(
          repo.id
        )
      } catch (err) {
        console.error(`[PollingService] fetch failed for ${repo.localPath}:`, err)
      }
    })
  )
}
