import {getDb} from '../db/index.js'
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
  const targets = db
    .prepare(
      `
      SELECT
        r.id AS repo_id,
        r.local_path,
        r.github_token,
        rb.id AS branch_id,
        rb.name
      FROM repositories r
      JOIN repository_branches rb ON rb.repository_id = r.id
      WHERE rb.status = 'active'
    `
    )
    .all() as Array<{
    repo_id: string
    local_path: string
    github_token: string | null
    branch_id: string
    name: string
  }>

  await Promise.allSettled(
    targets.map(async (target) => {
      try {
        await GitService.fetchOrigin(target.local_path, target.name, target.github_token)
        db.prepare("UPDATE repositories SET last_fetched_at = datetime('now') WHERE id = ?").run(
          target.repo_id
        )
        db.prepare(
          "UPDATE repository_branches SET last_fetched_at = datetime('now') WHERE id = ?"
        ).run(target.branch_id)
      } catch (err) {
        console.error(`[PollingService] fetch failed for ${target.local_path}:${target.name}:`, err)
      }
    })
  )
}
