import type {TestSet} from '../../types/index.ts'

export interface TestSetHistoryGroup {
  key: string
  targets: NonNullable<TestSet['commitTargets']>
  fallbackLabel: string
  latestAt: string
  isCurrent: boolean
  testSets: TestSet[]
}

export function groupTestSetsByBranchCombination(
  testSets: TestSet[],
  activeBranchSignature: string
): TestSetHistoryGroup[] {
  const groups = new Map<string, TestSetHistoryGroup>()

  for (const testSet of testSets) {
    const key = getHistoryGroupKey(testSet)
    const latestAt = testSet.latestAnalysisRunAt ?? testSet.createdAt
    const existing = groups.get(key)

    if (existing) {
      existing.testSets.push(testSet)
      if (new Date(latestAt).getTime() > new Date(existing.latestAt).getTime()) {
        existing.latestAt = latestAt
      }
      existing.isCurrent =
        existing.isCurrent ||
        Boolean(testSet.branchSignature && testSet.branchSignature === activeBranchSignature)
      if (existing.targets.length === 0 && testSet.commitTargets?.length) {
        existing.targets = testSet.commitTargets
      }
      continue
    }

    groups.set(key, {
      key,
      targets: testSet.commitTargets ?? [],
      fallbackLabel: getFallbackHistoryLabel(testSet),
      latestAt,
      isCurrent: Boolean(
        testSet.branchSignature && testSet.branchSignature === activeBranchSignature
      ),
      testSets: [testSet],
    })
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      testSets: [...group.testSets].sort((a, b) => getLatestTime(b) - getLatestTime(a)),
    }))
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
      return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
    })
}

export function getHistoryGroupKey(testSet: TestSet): string {
  if (testSet.analysisContextId) return testSet.analysisContextId
  if (testSet.branchSignature) return testSet.branchSignature

  const targetSignature = (testSet.commitTargets ?? [])
    .map((target) => `${target.repositoryId}:${target.branchName}`)
    .sort()
    .join('|')
  if (targetSignature) return targetSignature

  return Object.keys(testSet.commitRanges).sort().join('|') || testSet.id
}

export function getFallbackHistoryLabel(testSet: TestSet): string {
  const rangeCount = Object.keys(testSet.commitRanges).length
  return rangeCount > 0
    ? `${rangeCount} branch range${rangeCount === 1 ? '' : 's'}`
    : 'Unknown branch combination'
}

export function getLatestTime(testSet: TestSet): number {
  return new Date(testSet.latestAnalysisRunAt ?? testSet.createdAt).getTime()
}

export function formatHistoryDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getGroupTooltip(group: TestSetHistoryGroup): string {
  if (group.targets.length === 0) return group.fallbackLabel

  return group.targets
    .map(
      (target) =>
        `${repoName(target.repositoryPath)} / ${target.branchName}: ${target.from ?? 'start'}..${target.to}`
    )
    .join('\n')
}

export function repoName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}
