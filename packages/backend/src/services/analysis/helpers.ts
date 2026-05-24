import type {CommitInfo} from '../../types/index.js'

/**
 * Append a new AI summary to the existing one, dating each update. Used when an
 * active test set is extended by a follow-up analysis.
 */
export function appendSummary(current: string | null, next: string): string {
  if (!current?.trim()) return next
  if (!next.trim()) return current
  const date = new Date().toISOString().slice(0, 10)
  return `${current}\n\nUpdate ${date}: ${next}`
}

/** Union two string arrays, trimming, dropping blanks, and de-duplicating. */
export function mergeStringArrays(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b].map((item) => item.trim()).filter(Boolean))]
}

export function normalizeResolutionNote(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Build a test-set name from the commit range covered, falling back to a date. */
export function buildTestSetName(commits: CommitInfo[], dateStr: string): string {
  const hashes = commits.map((c) => c.shortHash)
  return hashes.length > 0
    ? `${hashes[hashes.length - 1]}..${hashes[0]} · ${dateStr}`
    : `Analysis · ${dateStr}`
}
