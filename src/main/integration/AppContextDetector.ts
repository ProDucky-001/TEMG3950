import type { PlatformSpecificManager } from './PlatformSpecificManager'
import { getAppIdFromProcessName } from './appMapping'
import { OUTLOOK_WEB_DOMAINS } from '../detection/EmailPatterns'
import type { SupportedAppId } from '../../shared/integration-types'

/** Gmail URL patterns (browser). */
const GMAIL_URL_PATTERNS = [
  /^https?:\/\/(www\.)?mail\.google\.com(\/|$)/,
  /^https?:\/\/(www\.)?mail\.google\.com\/mail/,
  /^https?:\/\/(www\.)?mail\.google\.com\/u\/\d+/,
  /^https?:\/\/(accounts\.)?google\.com\/.*mail/,
  /^https?:\/\/(www\.)?google\.com\/mail/,
]

/** Returns true if url is an Outlook web URL (uses EmailPatterns.OUTLOOK_WEB_DOMAINS). */
function isOutlookWebUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  const normalized = url.trim().toLowerCase()
  if (!normalized) return false
  const withScheme = /^https?:\/\//i.test(normalized) ? normalized : 'https://' + normalized
  return OUTLOOK_WEB_DOMAINS.some((domain) => withScheme.includes(domain))
}

/** Window title hints for context (reading vs composing). */
const COMPOSE_TITLE_HINTS = ['compose', 'new message', 'reply', 'forward', 'write']
const INBOX_TITLE_HINTS = ['inbox', 'mail', 'messages']

export type EmailContextType = 'inbox' | 'reading' | 'composing' | 'unknown'

export interface AppContextResult {
  /** Whether an email client is currently active. */
  isEmailClientActive: boolean
  /** Detected app (gmail, outlook, or generic for Apple Mail etc.). */
  appId: SupportedAppId | null
  /** Best-effort context for ROI/UX. */
  context: EmailContextType
  /** Current browser URL when app is browser (Gmail/Outlook web). */
  browserUrl: string | null
  /** Window or app name for logging. */
  windowName: string
}

/**
 * Determines when the user is viewing an email client (Gmail, Outlook, Apple Mail, etc.)
 * and the context (inbox list, reading email, composing). Uses minimal CPU when no email client is active.
 */
export class AppContextDetector {
  constructor(private readonly platform: PlatformSpecificManager) {}

  /**
   * Returns current app context. Call only when you need it (e.g. every 3s during capture polling).
   */
  async getContext(): Promise<AppContextResult> {
    const app = await this.platform.getActiveApplication()
    const windowName = app?.name ?? ''
    const appId = getAppIdFromProcessName(windowName)
    const nameLower = windowName.toLowerCase()

    // Browser: check URL for Gmail/Outlook web
    if (appId === 'chrome' || appId === 'safari' || appId === 'firefox') {
      let url = await this.platform.getCurrentBrowserUrl()
      const urlToTest = url && !/^https?:\/\//i.test(url) ? 'https://' + url.replace(/^\s+|\s+$/g, '') : url
      const isGmail = urlToTest && GMAIL_URL_PATTERNS.some((p) => p.test(urlToTest))
      const isOutlookWeb = urlToTest && isOutlookWebUrl(urlToTest)
      if (isGmail) {
        return {
          isEmailClientActive: true,
          appId: 'gmail',
          context: this.inferContextFromTitle(urlToTest, windowName),
          browserUrl: url,
          windowName,
        }
      }
      if (isOutlookWeb) {
        return {
          isEmailClientActive: true,
          appId: 'outlook',
          context: this.inferContextFromTitle(urlToTest, windowName),
          browserUrl: url,
          windowName,
        }
      }
      return {
        isEmailClientActive: false,
        appId,
        context: 'unknown',
        browserUrl: url,
        windowName,
      }
    }

    // Unknown app but window name looks like a browser (e.g. Brave, Chromium): try URL + OCR hints
    const browserLike =
      !appId &&
      (nameLower.includes('chrome') || nameLower.includes('firefox') || nameLower.includes('safari') ||
       nameLower.includes('edge') || nameLower.includes('brave') || nameLower.includes('browser'))
    if (browserLike) {
      const url = await this.platform.getCurrentBrowserUrl()
      const urlToTest = url && !/^https?:\/\//i.test(url) ? 'https://' + url.replace(/^\s+|\s+$/g, '') : url
      const isGmail = urlToTest && GMAIL_URL_PATTERNS.some((p) => p.test(urlToTest))
      const isOutlookWeb = urlToTest && isOutlookWebUrl(urlToTest)
      if (isGmail) {
        return {
          isEmailClientActive: true,
          appId: 'gmail',
          context: this.inferContextFromTitle(urlToTest ?? '', windowName),
          browserUrl: url,
          windowName,
        }
      }
      if (isOutlookWeb) {
        return {
          isEmailClientActive: true,
          appId: 'outlook',
          context: this.inferContextFromTitle(urlToTest ?? '', windowName),
          browserUrl: url,
          windowName,
        }
      }
      return {
        isEmailClientActive: false,
        appId: 'chrome',
        context: 'unknown',
        browserUrl: url,
        windowName,
      }
    }

    // Native app: Apple Mail, Outlook desktop
    if (appId === 'outlook') {
      return {
        isEmailClientActive: true,
        appId: 'outlook',
        context: this.inferContextFromTitle('', windowName),
        browserUrl: null,
        windowName,
      }
    }
    // Apple Mail: "Mail", "Apple Mail", or any process name containing "mail" when not already a browser
    const isAppleMail =
      (nameLower === 'mail' || nameLower.includes('apple mail') || (nameLower.includes('mail') && (appId === 'generic' || !appId))) &&
      appId !== 'chrome' &&
      appId !== 'safari' &&
      appId !== 'firefox'
    if (isAppleMail) {
      return {
        isEmailClientActive: true,
        appId: 'generic',
        context: this.inferContextFromTitle('', windowName),
        browserUrl: null,
        windowName,
      }
    }

    return {
      isEmailClientActive: false,
      appId: null,
      context: 'unknown',
      browserUrl: null,
      windowName,
    }
  }

  private inferContextFromTitle(url: string, windowTitle: string): EmailContextType {
    const combined = `${url} ${windowTitle}`.toLowerCase()
    if (COMPOSE_TITLE_HINTS.some((h) => combined.includes(h))) return 'composing'
    if (INBOX_TITLE_HINTS.some((h) => combined.includes(h))) return 'inbox'
    if (url || windowTitle) return 'reading'
    return 'unknown'
  }
}
