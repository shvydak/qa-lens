import {describe, expect, it} from 'vitest'
import {__testing} from '../../services/GitService.js'

describe('GitService auth helpers', () => {
  it('passes GitHub tokens as a Basic auth header for Git-over-HTTPS', () => {
    const args = __testing.withAuth(
      ['ls-remote', '--heads', 'https://github.com/org/repo'],
      'secret-token'
    )
    const expectedCredentials = Buffer.from('x-access-token:secret-token').toString('base64')

    expect(args).toEqual([
      '-c',
      `http.extraHeader=Authorization: Basic ${expectedCredentials}`,
      'ls-remote',
      '--heads',
      'https://github.com/org/repo',
    ])
    expect(args.join(' ')).not.toContain('secret-token')
  })

  it('rejects unsafe git commands before execution', () => {
    expect(() => __testing.assertAllowedGitCommand(['push', 'origin', 'main'])).toThrow(
      'Refusing unsafe git command'
    )
    expect(() => __testing.assertAllowedGitCommand(['reset', '--hard'])).toThrow(
      'Refusing unsafe git command'
    )
    expect(() => __testing.assertAllowedGitCommand(['fetch', 'origin', 'main'])).not.toThrow()
  })

  it('returns sanitized auth errors without leaking tokens', () => {
    const message = __testing.safeGitErrorMessage({
      stderr:
        'fatal: Authentication failed for https://x-access-token:secret-token@github.com/org/repo.git',
      message: 'Command failed with secret-token',
    })

    expect(message).toBe(
      'Git authentication failed. Check the repository URL and token permissions.'
    )
    expect(message).not.toContain('secret-token')
  })
})
