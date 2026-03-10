/**
 * ScamShield logger: writes to .cursor/scamshield-debug.log (unless SCAMSHIELD_DEBUG_LOG=0).
 * INFO and ERROR are also printed to the terminal.
 */

import fs from 'fs'
import path from 'path'

const PREFIX = '[ScamShield]'
const LOG_DISABLED = process.env.SCAMSHIELD_DEBUG_LOG === '0'

let logPath: string | null = null

function getLogPath(): string {
  if (logPath) return logPath
  const cwd = process.cwd()
  logPath = path.join(cwd, '.cursor', 'scamshield-debug.log')
  return logPath
}

function ensureDir(dir: string): void {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  } catch {
    // ignore
  }
}

function formatArgs(args: unknown[]): string {
  if (args.length === 0) return ''
  return args
    .map((a) => (a instanceof Error ? a.message + (a.stack ? '\n' + a.stack : '') : JSON.stringify(a)))
    .join(' ')
}

function write(level: string, message: string, ...args: unknown[]): void {
  if (LOG_DISABLED) return
  try {
    const extra = formatArgs(args)
    const line = `${new Date().toISOString()} ${PREFIX} [${level}] ${message}${extra ? ' ' + extra : ''}\n`
    const filePath = getLogPath()
    ensureDir(path.dirname(filePath))
    fs.appendFileSync(filePath, line)
  } catch {
    // ignore write errors
  }
}

export const logger = {
  info(message: string, ...args: unknown[]): void {
    write('INFO', message, ...args)
    console.info(PREFIX, message, ...args)
  },
  warn(message: string, ...args: unknown[]): void {
    write('WARN', message, ...args)
    console.warn(PREFIX, message, ...args)
  },
  error(message: string, ...args: unknown[]): void {
    write('ERROR', message, ...args)
    console.error(PREFIX, message, ...args)
  },
  debug(message: string, ...args: unknown[]): void {
    write('DEBUG', message, ...args)
  },
}
