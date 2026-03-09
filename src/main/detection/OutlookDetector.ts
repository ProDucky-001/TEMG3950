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
   * Infer Outlook context from window title and optional URL (inbox, email, compose, calendar, settings).
   */
  getOutlookContext(windowName: string, url?: string | null): OutlookContext {
    const combined = `${windowName ?? ''} ${url ?? ''}`.toLowerCase()

    if (
      combined.includes('compose') ||
      combined.includes('new message') ||
      combined.includes('reply') ||
      combined.includes('forward') ||
      combined.includes('write')
    ) {
      return { section: 'compose' }
    }
    if (
      combined.includes('calendar') ||
      combined.includes('/calendar')
    ) {
      return { section: 'calendar' }
    }
    if (
      combined.includes('settings') ||
      combined.includes('options') ||
      combined.includes('/settings')
    ) {
      return { section: 'settings' }
    }
    if (
      combined.includes('inbox') ||
      combined.includes('mail') ||
      combined.includes('messages')
    ) {
      return { section: 'inbox' }
    }
    if (combined.trim().length > 0) {
      return { section: 'email' }
    }
    return { section: 'unknown' }
  }
}
