/**
 * Writes captured page content (extension or OCR) to a debug log file for inspection.
 * Log path: <cwd>/.cursor/debug-page-content.log
 * Set SCAMSHIELD_DEBUG_CONTENT=0 to disable.
 */

import fs from 'fs'
import path from 'path'

const LOG_DISABLED = process.env.SCAMSHIELD_DEBUG_CONTENT === '0'

let logPath: string | null = null

function getLogPath(): string {
  if (logPath) return logPath
  const cwd = process.cwd()
  logPath = path.join(cwd, '.cursor', 'debug-page-content.log')
  return logPath
}

function ensureDir(dir: string): void {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  } catch {
    // ignore
  }
}

/** Deduplicate lines: keep order, one line per unique content (collapse repeated lines). */
export function dedupeText(text: string): string {
  if (!text || typeof text !== 'string') return ''
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    if (seen.has(line)) continue
    seen.add(line)
    out.push(line)
  }
  return out.join('\n')
}

export interface PageContentEntry {
  source: 'extension' | 'ocr'
  url?: string
  timestamp: number
  /** Full page text (optionally deduplicated). */
  content: string
}

/**
 * Append a page content entry to the debug log. Safe to call from any context; never throws.
 */
export function writePageContentLog(entry: PageContentEntry): void {
  if (LOG_DISABLED) return
  const content = entry.content || ''
  if (!content.trim()) return
  try {
    const deduped = dedupeText(content)
    const header = `\n--- ${entry.source} ${new Date(entry.timestamp).toISOString()} ${(entry.url || '').substring(0, 80)} ---\n`
    const body = deduped.substring(0, 50_000) + (deduped.length > 50_000 ? '\n...[truncated]' : '')
    const filePath = getLogPath()
    ensureDir(path.dirname(filePath))
    fs.appendFileSync(filePath, header + body + '\n')
  } catch {
    // ignore
  }
}
