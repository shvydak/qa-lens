import {basename} from 'node:path'

export function repoDisplayName(localPath: string, githubUrl?: string | null): string {
  if (githubUrl) {
    const match = /github\.com\/([^/]+\/[^/]+?)(?:\.git)?(?:\/.*)?$/.exec(githubUrl)
    if (match) return match[1]
  }
  return basename(localPath).replace(/-[A-Z0-9]{26}$/, '')
}
