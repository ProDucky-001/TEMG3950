import type { WindowInfo } from './types'

export type DetectionPriority = 'high' | 'medium' | 'low'

const POLL_INTERVAL_MS: Record<DetectionPriority, number> = {
  high: 300,
  medium: 1500,
  low: 4000,
}

/** Email app types (from appId or process name). */
const EMAIL_APP_TYPES = new Set(['gmail', 'outlook', 'generic'])
/** Browser app types that might show email. */
const BROWSER_APP_TYPES = new Set(['chrome', 'safari', 'firefox'])

/**
 * Prioritizes detection based on window/app type and optional content hash to skip unchanged windows.
 */
export class PriorityManager {
  private lastWindowHash: string = ''

  /** Priority: high when email app focused, medium when browser, low otherwise. */
  getPriority(windowInfo: WindowInfo): DetectionPriority {
    const appType = (windowInfo.appType ?? '').toLowerCase()
    if (EMAIL_APP_TYPES.has(appType)) return 'high'
    if (BROWSER_APP_TYPES.has(appType)) return 'medium'
    return 'low'
  }

  getPollingInterval(priority: DetectionPriority): number {
    return POLL_INTERVAL_MS[priority] ?? 2000
  }

  /** Hash window identity for change detection (includes URL so tab switches are detected). */
  hashWindow(windowInfo: WindowInfo): string {
    const b = windowInfo.bounds
    const url = windowInfo.browserUrl ?? ''
    return `${windowInfo.owner.name}|${b.x},${b.y},${b.width}x${b.height}|${windowInfo.appType}|${url.slice(0, 120)}`
  }

  /** Return true if we should run capture/OCR (window identity or content changed). */
  shouldScan(windowInfo: WindowInfo): boolean {
    const newHash = this.hashWindow(windowInfo)
    if (newHash === this.lastWindowHash) return false
    this.lastWindowHash = newHash
    return true
  }

  reset(): void {
    this.lastWindowHash = ''
  }
}
