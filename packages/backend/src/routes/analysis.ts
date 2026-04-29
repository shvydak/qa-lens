import { Router } from 'express'
import * as AnalysisService from '../services/AnalysisService.js'
import { ActiveTestSetExistsError, NoNewCommitsError } from '../services/AnalysisService.js'
import { AllProvidersFailedError } from '../services/AIService.js'
import { ulid } from '../utils/ulid.js'

export const analysisRouter = Router({ mergeParams: true })

const results = new Map<string, { testSetId?: string; error?: string }>()

analysisRouter.post('/', async (req, res) => {
  const { projectId } = req.params as { projectId: string }
  const { repoIds = [] } = req.body as { repoIds?: string[] }

  if (AnalysisService.getRunningJob(projectId)) {
    return res.status(409).json({ error: 'Analysis already running for this project' })
  }

  const jobId = ulid()
  results.delete(projectId)

  res.status(202).json({ data: { jobId, status: 'running' } })

  AnalysisService.run({ projectId, repoIds, startedAt: new Date().toISOString() })
    .then(({ testSetId }) => {
      results.set(projectId, { testSetId })
    })
    .catch((err: unknown) => {
      let message = 'Analysis failed'
      if (err instanceof NoNewCommitsError) message = 'no_new_commits'
      else if (err instanceof ActiveTestSetExistsError) message = `active_test_set_exists:${err.testSetId}`
      else if (err instanceof AllProvidersFailedError) message = `AI providers failed: ${err.errors.join('; ')}`
      else if (err instanceof Error) message = err.message
      results.set(projectId, { error: message })
    })

  return
})

analysisRouter.get('/status', (req, res) => {
  const { projectId } = req.params as { projectId: string }
  const running = !!AnalysisService.getRunningJob(projectId)
  const result = results.get(projectId)

  res.json({
    data: {
      running,
      testSetId: result?.testSetId ?? null,
      error: result?.error ?? null,
    },
  })
})
