import {Router} from 'express'
import * as AnalysisService from '../services/AnalysisService.js'
import {NoNewCommitsError} from '../services/AnalysisService.js'
import {AllProvidersFailedError} from '../services/AIService.js'
import {asyncHandler} from './asyncHandler.js'
import {ulid} from '../utils/ulid.js'

export const analysisRouter = Router({mergeParams: true})

interface AnalysisJobResult {
  testSetId?: string
  addedTests?: number
  totalTests?: number
  isEmptyReview?: boolean
  error?: string
}

const results = new Map<string, AnalysisJobResult>()

analysisRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const {projectId} = req.params as {projectId: string}
    const {repoIds = []} = req.body as {repoIds?: string[]}

    if (AnalysisService.getRunningJob(projectId)) {
      return res.status(409).json({error: 'Analysis already running for this project'})
    }

    const jobId = ulid()
    results.delete(projectId)

    res.status(202).json({data: {jobId, status: 'running'}})

    AnalysisService.run({projectId, repoIds, startedAt: new Date().toISOString()})
      .then(({testSetId, addedTests, totalTests, isEmptyReview}) => {
        results.set(projectId, {testSetId, addedTests, totalTests, isEmptyReview})
      })
      .catch((err: unknown) => {
        let message = 'Analysis failed'
        if (err instanceof NoNewCommitsError) message = 'no_new_commits'
        else if (err instanceof AllProvidersFailedError)
          message = `AI providers failed: ${err.errors.join('; ')}`
        else if (err instanceof Error) message = err.message
        results.set(projectId, {error: message})
      })

    return
  })
)

analysisRouter.get('/status', (req, res) => {
  const {projectId} = req.params as {projectId: string}
  const running = !!AnalysisService.getRunningJob(projectId)
  const result = results.get(projectId)

  res.json({
    data: {
      running,
      testSetId: result?.testSetId ?? null,
      addedTests: result?.addedTests ?? null,
      totalTests: result?.totalTests ?? null,
      isEmptyReview: result?.isEmptyReview ?? null,
      error: result?.error ?? null,
    },
  })
})
