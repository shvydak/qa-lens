import {describe, expect, it, vi} from 'vitest'
import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {AnalysisStatus} from '../../types/index.ts'
import AnalysisPanel from './AnalysisPanel.tsx'

const idleStatus: AnalysisStatus = {
  running: false,
  testSetId: null,
  addedTests: null,
  totalTests: null,
  isEmptyReview: null,
  error: null,
}

describe('AnalysisPanel', () => {
  it('shows a spinner and hides the action while running', () => {
    render(<AnalysisPanel status={{...idleStatus, running: true}} onAnalyze={vi.fn()} />)

    expect(screen.getByText('Analyzing changes...')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('fires onAnalyze when the button is clicked', async () => {
    const onAnalyze = vi.fn()
    render(<AnalysisPanel status={idleStatus} actionLabel="Run Analysis" onAnalyze={onAnalyze} />)

    await userEvent.click(screen.getByRole('button', {name: /run analysis/i}))

    expect(onAnalyze).toHaveBeenCalledTimes(1)
  })

  it('does not fire onAnalyze and shows the reason when disabled', async () => {
    const onAnalyze = vi.fn()
    render(
      <AnalysisPanel
        status={idleStatus}
        disabled
        disabledReason="There are no new commits to analyze"
        onAnalyze={onAnalyze}
      />
    )

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onAnalyze).not.toHaveBeenCalled()
    expect(screen.getByText('There are no new commits to analyze')).toBeInTheDocument()
  })

  it('renders the no-new-commits notice without an error banner', () => {
    render(<AnalysisPanel status={{...idleStatus, error: 'no_new_commits'}} onAnalyze={vi.fn()} />)

    expect(screen.getByText('All commits have already been analyzed')).toBeInTheDocument()
    expect(screen.queryByText('Analysis failed')).not.toBeInTheDocument()
  })
})
