import {describe, expect, it} from 'vitest'
import {commitUrl, normalizeBranchNames, safeRepoSlug} from '../../routes/repositories.helpers.js'

describe('commitUrl', () => {
  it('builds a GitHub commit URL from an HTTPS or SSH remote', () => {
    expect(commitUrl('https://github.com/org/repo', 'abc123')).toBe(
      'https://github.com/org/repo/commit/abc123'
    )
    expect(commitUrl('https://github.com/org/repo.git', 'abc123')).toBe(
      'https://github.com/org/repo/commit/abc123'
    )
    expect(commitUrl('git@github.com:org/repo.git', 'abc123')).toBe(
      'https://github.com/org/repo/commit/abc123'
    )
  })

  it('returns null for missing input or non-GitHub remotes', () => {
    expect(commitUrl(null, 'abc123')).toBeNull()
    expect(commitUrl('https://github.com/org/repo', '')).toBeNull()
    expect(commitUrl('https://gitlab.com/org/repo', 'abc123')).toBeNull()
  })
})

describe('safeRepoSlug', () => {
  it('derives an owner-repo slug and strips unsafe characters', () => {
    expect(safeRepoSlug('https://github.com/org/repo')).toBe('org-repo')
    expect(safeRepoSlug('https://github.com/org/repo.git')).toBe('org-repo')
    expect(safeRepoSlug('git@github.com:My.Org/Weird Name')).toBe('My.Org-Weird-Name')
  })
})

describe('normalizeBranchNames', () => {
  it('trims, drops blanks, and de-duplicates', () => {
    expect(normalizeBranchNames([' main ', 'main', '', 'dev', '  '])).toEqual(['main', 'dev'])
  })
})
