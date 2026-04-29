import {Router} from 'express'
import {execFile} from 'child_process'
import {promisify} from 'util'

const execFileAsync = promisify(execFile)
export const utilsRouter = Router()

// Opens macOS native folder picker and returns selected path
utilsRouter.get('/pick-folder', async (_req, res) => {
  try {
    const {stdout} = await execFileAsync('osascript', [
      '-e',
      'POSIX path of (choose folder with prompt "Select repository folder")',
    ])
    const path = stdout.trim().replace(/\/$/, '')
    res.json({data: {path}})
  } catch (err: unknown) {
    // User cancelled the dialog — osascript exits with code 1
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('User canceled')) {
      res.json({data: {path: null}})
    } else {
      res.status(500).json({error: msg})
    }
  }
})
