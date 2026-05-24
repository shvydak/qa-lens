import type {Test, TestSet} from '../../types/index.ts'

export const STATUS_STYLES: Record<TestSet['status'], string> = {
  active: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
  passed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/15 text-red-400 border-red-500/20',
  reviewed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  not_required: 'bg-gray-700/30 text-gray-300 border-gray-700/40',
}

export const STATUS_LABELS: Record<TestSet['status'], string> = {
  active: 'In progress',
  passed: 'Passed',
  failed: 'Failed',
  reviewed: 'Reviewed',
  not_required: 'No retest needed',
}

const PRIORITY_ORDER: Record<Test['priority'], number> = {high: 0, medium: 1, low: 2}

/** Sort tests high → low priority, breaking ties by their stored sort order. */
export function sortTestsByPriority(items: Test[]): Test[] {
  return [...items].sort((a, b) => {
    const diff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    return diff !== 0 ? diff : a.sortOrder - b.sortOrder
  })
}

export interface AreaGroup {
  key: string
  label: string
  isFallback: boolean
  tests: Test[]
}

/** Group tests by product area, sorting named areas first and "Other" last. */
export function groupTestsByArea(tests: Test[]): AreaGroup[] {
  const groups = new Map<string, AreaGroup>()

  for (const test of tests) {
    const area = test.area?.trim()
    const key = area ? area.toLocaleLowerCase() : '__other__'
    const existing = groups.get(key)

    if (existing) {
      existing.tests.push(test)
      continue
    }

    groups.set(key, {
      key,
      label: area || 'Other',
      isFallback: !area,
      tests: [test],
    })
  }

  return [...groups.values()].sort((a, b) => {
    if (a.isFallback !== b.isFallback) return a.isFallback ? 1 : -1
    return a.label.localeCompare(b.label)
  })
}
