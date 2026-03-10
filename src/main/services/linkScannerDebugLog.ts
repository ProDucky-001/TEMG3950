/**
 * Writes link scanner results to a debug log file (one JSON object per line).
 * Log path: <project>/.cursor/debug-link-scanner.log (so it appears next to your project).
 * Set SCAMSHIELD_DEBUG_LINKS=0 to disable.
 */

import fs from 'fs'
import path from 'path'
import type { LinkDetectionResult } from '../../shared/link-detection-types'

export interface LinkScanDebugContext {
  isEmail?: boolean
  source?: string
}

const LOG_DISABLED = process.env.SCAMSHIELD_DEBUG_LINKS === '0'

let logPath: string | null = null

function getLogPath(): string {
  if (logPath) return logPath
  const cwd = process.cwd()
  logPath = path.join(cwd, '.cursor', 'debug-link-scanner.log')
  return logPath
}

function ensureDir(dir: string): void {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  } catch {
    // ignore
  }
}

/**
 * Append one line to the link scanner debug log. Safe to call from any context; never throws.
 */
export function writeLinkScanDebugLog(
  result: LinkDetectionResult,
  context?: LinkScanDebugContext
): void {
  if (LOG_DISABLED) return
  try {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      url: result.url,
      resolvedUrl: result.resolvedUrl ?? null,
      riskScore: result.riskScore,
      confidence: result.confidence,
      threatTypes: result.threatTypes,
      isEmail: context?.isEmail ?? null,
      source: context?.source ?? null,
      explanation: result.explanation?.substring(0, 200) ?? null,
    }) + '\n'
    const filePath = getLogPath()
    ensureDir(path.dirname(filePath))
    fs.appendFileSync(filePath, line)
  } catch {
    // ignore write errors
  }
}
