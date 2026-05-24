import {describe, expect, it} from 'vitest'
import type {CommitInfo} from '../../types/index.js'
import {
  appendSummary,
  buildTestSetName,
  mergeStringArrays,
  normalizeResolutionNote,
} from '../../services/analysis/helpers.js'

describe('appendSummary', () => {
  it('returns the new summary when there is no existing one', () => {
    expect(appendSummary(null, 'fresh')).toBe('fresh')
    expect(appendSummary('  ', 'fresh')).toBe('fresh')
  })

  it('keeps the existing summary when the new one is blank', () => {
    expect(appendSummary('existing', '   ')).toBe('existing')
  })

  it('appends a dated update when both are present', () => {
    const result = appendSummary('existing', 'more')
    expect(result.startsWith('existing\n\nUpdate ')).toBe(true)
    expect(result.endsWith(': more')).toBe(true)
  })
})

describe('mergeStringArrays', () => {
  it('unions, trims, drops blanks, and de-duplicates', () => {
    expect(mergeStringArrays(['a', ' b '], ['b', '', 'c'])).toEqual(['a', 'b', 'c'])
  })
})

describe('normalizeResolutionNote', () => {
  it('trims and converts empty notes to null', () => {
    expect(normalizeResolutionNote('  note  ')).toBe('note')
    expect(normalizeResolutionNote('   ')).toBeNull()
    expect(normalizeResolutionNote(undefined)).toBeNull()
  })
})

describe('buildTestSetName', () => {
  const commit = (shortHash: string): CommitInfo => ({
    hash: `${shortHash}-full`,
    shortHash,
    author: 'a',
    date: '2024-01-01',
    message: 'm',
  })

  it('spans the newest..oldest short hashes', () => {
    expect(buildTestSetName([commit('aaa'), commit('bbb'), commit('ccc')], '2024-01-01')).toBe(
      'ccc..aaa · 2024-01-01'
    )
  })

  it('falls back to a date-only label with no commits', () => {
    expect(buildTestSetName([], '2024-01-01')).toBe('Analysis · 2024-01-01')
  })
})
