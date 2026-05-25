import {describe, expect, it} from 'vitest'
import {repoDisplayName} from '../../routes/testSets.helpers.js'

describe('repoDisplayName', () => {
  describe('GitHub URL', () => {
    it('extracts owner/repo from HTTPS URL', () => {
      expect(repoDisplayName('/some/path', 'https://github.com/acme/my-app')).toBe('acme/my-app')
    })

    it('strips .git suffix', () => {
      expect(repoDisplayName('/some/path', 'https://github.com/acme/my-app.git')).toBe(
        'acme/my-app'
      )
    })

    it('ignores trailing path segments after the repo name', () => {
      expect(repoDisplayName('/some/path', 'https://github.com/acme/my-app/tree/main')).toBe(
        'acme/my-app'
      )
    })

    it('handles subgroups — stops at the second segment', () => {
      expect(repoDisplayName('/some/path', 'https://github.com/acme/my-app/extra/stuff')).toBe(
        'acme/my-app'
      )
    })
  })

  describe('local path fallback', () => {
    it('returns the basename when no github URL is provided', () => {
      expect(repoDisplayName('/home/user/projects/my-service')).toBe('my-service')
      expect(repoDisplayName('/home/user/projects/my-service', null)).toBe('my-service')
    })

    it('strips a 26-char uppercase ULID suffix from managed clone folder names', () => {
      expect(repoDisplayName('/managed/my-service-01ABCDEFGHJKMNPQRSTVWXYZ12')).toBe('my-service')
    })

    it('does not strip shorter or lowercase suffixes', () => {
      expect(repoDisplayName('/managed/my-service-short')).toBe('my-service-short')
      expect(repoDisplayName('/managed/my-service-abcdefghjkmnpqrstvwxyz1234')).toBe(
        'my-service-abcdefghjkmnpqrstvwxyz1234'
      )
    })

    it('handles a bare repo name with no path separator', () => {
      expect(repoDisplayName('my-repo')).toBe('my-repo')
    })
  })

  describe('non-GitHub URL falls back to path', () => {
    it('ignores gitlab URLs and uses local path instead', () => {
      expect(repoDisplayName('/home/user/my-service', 'https://gitlab.com/acme/my-app')).toBe(
        'my-service'
      )
    })
  })
})
