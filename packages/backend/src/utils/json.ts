/**
 * Parse a value that is expected to be a JSON-encoded string array (as stored in
 * SQLite columns), tolerating already-parsed arrays and malformed input.
 */
export function parseStringArray(value: unknown): string[] {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
    } catch {
      return []
    }
  }
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}
