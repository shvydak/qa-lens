const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export async function apiFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {'Content-Type': 'application/json'},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const json = await res.json()

  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`)
  }

  return json.data as T
}
