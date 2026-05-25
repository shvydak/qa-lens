import {describe, expect, it} from 'vitest'
import type {TestSet} from '../../types/index.ts'
import {
  getFallbackHistoryLabel,
  getHistoryGroupKey,
  groupTestSetsByBranchCombination,
  repoName,
} from './testSetGrouping.ts'

function makeTestSet(overrides: Partial<TestSet> = {}): TestSet {
  return {
    id: 'ts-1',
    projectId: 'proj-1',
    analysisContextId: null,
    branchSignature: null,
    name: 'Set',
    status: 'active',
    isEmptyReview: false,
    commitRanges: {},
    aiSummary: null,
    resolutionNote: null,
    regressions: [],
    crossImpacts: [],
    createdAt: '2024-01-01T00:00:00Z',
    completedAt: null,
    ...overrides,
  }
}

describe('getHistoryGroupKey', () => {
  it('prefers analysisContextId, then branchSignature', () => {
    expect(getHistoryGroupKey(makeTestSet({analysisContextId: 'ctx-1'}))).toBe('ctx-1')
    expect(
      getHistoryGroupKey(makeTestSet({analysisContextId: null, branchSignature: 'sig-1'}))
    ).toBe('sig-1')
  })

  it('falls back to a sorted commit-target signature', () => {
    const key = getHistoryGroupKey(
      makeTestSet({
        commitTargets: [
          {
            id: 'b',
            repositoryId: 'r2',
            repositoryPath: '/r2',
            repositoryName: 'r2',
            branchName: 'dev',
            from: null,
            to: 'x',
          },
          {
            id: 'a',
            repositoryId: 'r1',
            repositoryPath: '/r1',
            repositoryName: 'r1',
            branchName: 'main',
            from: null,
            to: 'y',
          },
        ],
      })
    )
    expect(key).toBe('r1:main|r2:dev')
  })
})

describe('groupTestSetsByBranchCombination', () => {
  it('groups sets by context and marks the active combination as current', () => {
    const sets = [
      makeTestSet({id: 'a', analysisContextId: 'ctx-1', branchSignature: 'sig-A'}),
      makeTestSet({id: 'b', analysisContextId: 'ctx-1', branchSignature: 'sig-A'}),
      makeTestSet({id: 'c', analysisContextId: 'ctx-2', branchSignature: 'sig-B'}),
    ]

    const groups = groupTestSetsByBranchCombination(sets, 'sig-A')

    expect(groups).toHaveLength(2)
    // current combination is sorted first
    expect(groups[0].key).toBe('ctx-1')
    expect(groups[0].isCurrent).toBe(true)
    expect(groups[0].testSets.map((t) => t.id).sort()).toEqual(['a', 'b'])
    expect(groups[1].isCurrent).toBe(false)
  })

  it('orders groups by most recent activity when none is current', () => {
    const sets = [
      makeTestSet({id: 'old', analysisContextId: 'ctx-old', createdAt: '2024-01-01T00:00:00Z'}),
      makeTestSet({id: 'new', analysisContextId: 'ctx-new', createdAt: '2024-05-01T00:00:00Z'}),
    ]

    const groups = groupTestSetsByBranchCombination(sets, 'sig-unrelated')

    expect(groups.map((g) => g.key)).toEqual(['ctx-new', 'ctx-old'])
  })
})

describe('getFallbackHistoryLabel', () => {
  it('pluralizes branch ranges', () => {
    expect(getFallbackHistoryLabel(makeTestSet({commitRanges: {a: {from: null, to: 'x'}}}))).toBe(
      '1 branch range'
    )
    expect(
      getFallbackHistoryLabel(
        makeTestSet({commitRanges: {a: {from: null, to: 'x'}, b: {from: null, to: 'y'}}})
      )
    ).toBe('2 branch ranges')
    expect(getFallbackHistoryLabel(makeTestSet({commitRanges: {}}))).toBe(
      'Unknown branch combination'
    )
  })
})

describe('repoName', () => {
  it('returns the last path segment', () => {
    expect(repoName('/managed/org-repo-123')).toBe('org-repo-123')
    expect(repoName('repo')).toBe('repo')
  })
})
