import express from 'express'
import {projectsRouter} from '../../routes/projects.js'
import {reposRouter, repoActionsRouter} from '../../routes/repositories.js'
import {testSetsRouter, testSetActionsRouter} from '../../routes/testSets.js'
import {testsRouter, testActionsRouter} from '../../routes/tests.js'

export function createTestApp() {
  const app = express()
  app.use(express.json())

  app.use('/api/projects', projectsRouter)
  app.use('/api/projects/:projectId/repos', reposRouter)
  app.use('/api/repos', repoActionsRouter)
  app.use('/api/projects/:projectId/test-sets', testSetsRouter)
  app.use('/api/test-sets', testSetActionsRouter)
  app.use('/api/test-sets/:testSetId/tests', testsRouter)
  app.use('/api/tests', testActionsRouter)

  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({error: err.message || 'Internal server error'})
    }
  )

  return app
}
