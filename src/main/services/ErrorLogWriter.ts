import * as fs from 'fs'
import * as path from 'path'

const LOG_FILE = 'main-errors.log'

/**
 * Append an error entry to the main process error log in app userData.
 * Used by global uncaughtException/unhandledRejection handlers.
 */
export function writeErrorToLog(
  userDataPath: string,
  kind: 'uncaughtException' | 'unhandledRejection',
  error: unknown
): void {
  try {
    const dir = userDataPath || path.join(process.cwd(), 'logs')
    const logPath = path.join(dir, LOG_FILE)
    const timestamp = new Date().toISOString()
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    const line = JSON.stringify({
      timestamp,
      kind,
      message,
      stack: stack ?? undefined,
    }) + '\n'
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.appendFileSync(logPath, line)
  } catch (_) {
    // Avoid throwing from error handler
    console.error('[ScamShield] Failed to write error log:', _)
  }
}
