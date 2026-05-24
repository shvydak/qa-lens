import {describe, expect, it} from 'vitest'
import type {Test} from '../../types/index.ts'
import {groupTestsByArea, sortTestsByPriority} from './helpers.ts'

function makeTest(overrides: Partial<Test> = {}): Test {
  return {
    id: 't',
    testSetId: 'ts',
    description: 'd',
    title: null,
    priority: 'medium',
    area: null,
    userScenario: null,
    preconditions: [],
    steps: [],
    expectedResult: null,
    risk: null,
    technicalContext: null,
    analysisRunId: null,
    repositoryBranchId: null,
    status: 'not_tested',
    source: 'ai',
    sortOrder: 0,
    note: null,
    attachments: [],
    ...overrides,
  }
}

describe('sortTestsByPriority', () => {
  it('orders high → medium → low, then by sortOrder', () => {
    const tests = [
      makeTest({id: 'low', priority: 'low', sortOrder: 0}),
      makeTest({id: 'high2', priority: 'high', sortOrder: 5}),
      makeTest({id: 'high1', priority: 'high', sortOrder: 1}),
      makeTest({id: 'med', priority: 'medium', sortOrder: 0}),
    ]

    expect(sortTestsByPriority(tests).map((t) => t.id)).toEqual(['high1', 'high2', 'med', 'low'])
  })

  it('does not mutate the input array', () => {
    const tests = [makeTest({id: 'a', priority: 'low'}), makeTest({id: 'b', priority: 'high'})]
    sortTestsByPriority(tests)
    expect(tests.map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('groupTestsByArea', () => {
  it('groups by trimmed, case-insensitive area and sorts "Other" last', () => {
    const tests = [
      makeTest({id: '1', area: 'Checkout'}),
      makeTest({id: '2', area: 'checkout '}),
      makeTest({id: '3', area: null}),
      makeTest({id: '4', area: 'Auth'}),
    ]

    const groups = groupTestsByArea(tests)

    expect(groups.map((g) => g.label)).toEqual(['Auth', 'Checkout', 'Other'])
    const checkout = groups.find((g) => g.key === 'checkout')
    expect(checkout?.tests.map((t) => t.id)).toEqual(['1', '2'])
    expect(groups.find((g) => g.label === 'Other')?.isFallback).toBe(true)
  })
})
