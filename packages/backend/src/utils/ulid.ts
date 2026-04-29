export function ulid(): string {
  const now = Date.now()
  const timeStr = now.toString(36).toUpperCase().padStart(10, '0')
  const randomStr = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 36).toString(36).toUpperCase()
  ).join('')
  return timeStr + randomStr
}
