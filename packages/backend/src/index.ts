import express from 'express'
import cors from 'cors'
import {rm, mkdir} from 'node:fs/promises'
import path from 'node:path'
import {config} from './config.js'
import {getDb} from './db/index.js'
import {projectsRouter} from './routes/projects.js'
import {reposRouter, repoActionsRouter} from './routes/repositories.js'
import {analysisRouter} from './routes/analysis.js'
import {testSetsRouter, testSetActionsRouter} from './routes/testSets.js'
import {testsRouter, testActionsRouter} from './routes/tests.js'
import * as PollingService from './services/PollingService.js'
import {utilsRouter} from './routes/utils.js'
import {settingsRouter} from './routes/settings.js'

const app = express()

app.use(cors({origin: config.clientOrigin}))
app.use(express.json())

app.use('/api/projects', projectsRouter)
app.use('/api/projects/:projectId/repos', reposRouter)
app.use('/api/repos', repoActionsRouter)
app.use('/api/projects/:projectId/analyze', analysisRouter)
app.use('/api/projects/:projectId/test-sets', testSetsRouter)
app.use('/api/test-sets', testSetActionsRouter)
app.use('/api/test-sets/:testSetId/tests', testsRouter)
app.use('/api/tests', testActionsRouter)
app.use('/api/utils', utilsRouter)
app.use('/api/settings', settingsRouter)

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({error: err.message || 'Internal server error'})
})

if (process.env.AI_DEBUG_DUMP) {
  const aiDebugDir = path.resolve(process.cwd(), '.ai-debug')
  await rm(aiDebugDir, {recursive: true, force: true})
  await mkdir(aiDebugDir, {recursive: true})
}

getDb()
PollingService.start()

app.listen(config.port, () => {
  console.log(`QA Lens backend running on http://localhost:${config.port}`)
})
