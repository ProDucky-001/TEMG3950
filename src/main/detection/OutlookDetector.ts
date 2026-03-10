import {
  OUTLOOK_WEB_DOMAINS,
  OUTLOOK_DESKTOP_PROCESS_NAMES,
} from './EmailPatterns'

export type OutlookContextSection =
  | 'inbox'
  | 'email'
  | 'compose'
  | 'calendar'
  | 'settings'
  | 'unknown'

export interface OutlookContext {
  section: OutlookContextSection
  folder?: string
}

/**
 * Outlook-specific detection (web and desktop) and context inference.
 */
export class OutlookDetector {
  /** Detect Outlook desktop app by process/window name. */
  detectDesktopOutlook(windowName: string): boolean {
    if (!windowName || typeof windowName !== 'string') return false
    const lower = windowName.toLowerCase()
    return OUTLOOK_DESKTOP_PROCESS_NAMES.some((name) => lower.includes(name.toLowerCase()))
  }

  /** Detect Outlook web (Outlook.com, OWA) by URL. */
  detectOutlookWeb(url: string | null | undefined): boolean {
    if (!url || typeof url !== 'string') return false
    const normalized = url.trim().toLowerCase()
    if (!normalized) return false
    const withScheme = /^https?:\/\//i.test(normalized) ? normalized : 'https://' + normalized
    return OUTLOOK_WEB_DOMAINS.some((domain) => withScheme.includes(domain))
  }

  /**
   * Outlook context (simplified: no window title or URL parsing).
   */
  getOutlookContext(_windowName: string, _url?: string | null): OutlookContext {
    return { section: 'unknown' }
  }
}
