import {describe, expect, it, vi} from 'vitest'
import {render, screen, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {Test} from '../../types/index.ts'
import TestItem from './TestItem.tsx'

const baseTest: Test = {
  id: 'test-1',
  testSetId: 'ts-1',
  description: 'Verify login flow',
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
  source: 'manual',
  sortOrder: 0,
  note: null,
  attachments: [],
}

function renderItem(overrides: Partial<Test> = {}, onStatusChange = vi.fn(), onDelete = vi.fn()) {
  const test = {...baseTest, ...overrides}
  render(
    <TestItem
      test={test}
      onStatusChange={onStatusChange}
      onDelete={onDelete}
      onNoteChange={vi.fn().mockResolvedValue(undefined)}
      onAttachmentUpload={vi.fn().mockResolvedValue(undefined)}
      onAttachmentDelete={vi.fn().mockResolvedValue(undefined)}
    />
  )
  return {onStatusChange, onDelete}
}

describe('TestItem status buttons', () => {
  it('renders Pass, Fail and Skip buttons', () => {
    renderItem()
    expect(screen.getByRole('button', {name: /pass/i})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /fail/i})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /skip/i})).toBeInTheDocument()
  })

  it('clicking Pass on a not_tested test calls onStatusChange("pass")', async () => {
    const {onStatusChange} = renderItem({status: 'not_tested'})
    await userEvent.click(screen.getByRole('button', {name: /^pass$/i}))
    expect(onStatusChange).toHaveBeenCalledWith('pass')
  })

  it('clicking Fail on a not_tested test calls onStatusChange("fail")', async () => {
    const {onStatusChange} = renderItem({status: 'not_tested'})
    await userEvent.click(screen.getByRole('button', {name: /^fail$/i}))
    expect(onStatusChange).toHaveBeenCalledWith('fail')
  })

  it('clicking Skip on a not_tested test calls onStatusChange("skip")', async () => {
    const {onStatusChange} = renderItem({status: 'not_tested'})
    await userEvent.click(screen.getByRole('button', {name: /^skip$/i}))
    expect(onStatusChange).toHaveBeenCalledWith('skip')
  })

  it('clicking the active Pass button resets to not_tested', async () => {
    const {onStatusChange} = renderItem({status: 'pass'})
    await userEvent.click(screen.getByRole('button', {name: /^pass$/i}))
    expect(onStatusChange).toHaveBeenCalledWith('not_tested')
  })

  it('clicking the active Fail button resets to not_tested', async () => {
    const {onStatusChange} = renderItem({status: 'fail'})
    await userEvent.click(screen.getByRole('button', {name: /^fail$/i}))
    expect(onStatusChange).toHaveBeenCalledWith('not_tested')
  })

  it('clicking the active Skip button resets to not_tested', async () => {
    const {onStatusChange} = renderItem({status: 'skip'})
    await userEvent.click(screen.getByRole('button', {name: /^skip$/i}))
    expect(onStatusChange).toHaveBeenCalledWith('not_tested')
  })

  it('clicking a non-active status button when another is active changes to that status', async () => {
    const {onStatusChange} = renderItem({status: 'pass'})
    await userEvent.click(screen.getByRole('button', {name: /^fail$/i}))
    expect(onStatusChange).toHaveBeenCalledWith('fail')
  })
})

describe('TestItem display', () => {
  it('shows title when present, not description', () => {
    renderItem({title: 'Short title', description: 'Long description'})
    expect(screen.getByText('Short title')).toBeInTheDocument()
    expect(screen.queryByText('Long description')).not.toBeInTheDocument()
  })

  it('falls back to description when title is null', () => {
    renderItem({title: null, description: 'Only description'})
    expect(screen.getByText('Only description')).toBeInTheDocument()
  })

  it('shows area badge when area is set', () => {
    renderItem({area: 'Auth'})
    expect(screen.getByText('Auth')).toBeInTheDocument()
  })

  it('shows manual badge for manual source', () => {
    renderItem({source: 'manual'})
    expect(screen.getByText('manual')).toBeInTheDocument()
  })

  it('does not show manual badge for ai source', () => {
    renderItem({source: 'ai'})
    expect(screen.queryByText('manual')).not.toBeInTheDocument()
  })
})

describe('TestItem delete confirmation', () => {
  it('opens a confirmation dialog instead of deleting immediately', async () => {
    const onDelete = vi.fn()
    renderItem({}, vi.fn(), onDelete)

    await userEvent.click(screen.getByRole('button', {name: /delete test/i}))

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('Delete test?')).toBeInTheDocument()
    expect(within(dialog).getByText('Verify login flow')).toBeInTheDocument()
    expect(within(dialog).getByText('This cannot be undone.')).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('cancels deletion from the dialog', async () => {
    const onDelete = vi.fn()
    renderItem({}, vi.fn(), onDelete)

    await userEvent.click(screen.getByRole('button', {name: /delete test/i}))
    await userEvent.click(screen.getByRole('button', {name: /^cancel$/i}))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('deletes after confirmation', async () => {
    const onDelete = vi.fn()
    renderItem({}, vi.fn(), onDelete)

    await userEvent.click(screen.getByRole('button', {name: /delete test/i}))
    await userEvent.click(screen.getByRole('button', {name: /^delete$/i}))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
