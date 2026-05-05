import {rmSync} from 'fs'
import {isAbsolute, relative, resolve} from 'path'
import {config} from '../config.js'

export type ManagedRepoRecord = {
  localPath: string
  sourceType: string | null
}

export function deleteManagedRepoFolders(repos: ManagedRepoRecord[]): void {
  const uniquePaths = new Set(
    repos
      .filter((repo) => repo.sourceType === 'managed_clone')
      .map((repo) => repo.localPath)
      .filter(isPathInsideManagedRepos)
  )

  for (const localPath of uniquePaths) {
    rmSync(localPath, {recursive: true, force: true})
  }
}

function isPathInsideManagedRepos(localPath: string): boolean {
  const managedRoot = resolve(config.managedReposPath)
  const target = resolve(localPath)
  const fromRoot = relative(managedRoot, target)

  return fromRoot !== '' && !fromRoot.startsWith('..') && !isAbsolute(fromRoot)
}
