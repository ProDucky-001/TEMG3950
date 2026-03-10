/**
 * Central email application patterns for detection (webmail domains and desktop process/window names).
 */

import type { ActiveWindowInfo } from './ActiveWindowInfo'
import { logger } from '../services/logger'

/**
 * Safely parse a URL and return the hostname (lowercase), or null if invalid.
 */
export function getHostFromUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed
  try {
    const u = new URL(withScheme)
    const host = u.hostname
    return host ? host.toLowerCase() : null
  } catch {
    return null
  }
}

/** Email domains to detect - hardcoded list (substring match on full URL). */
export const EMAIL_DOMAINS = [
  'outlook.live.com',
  'outlook.office.com',
  'outlook.office365.com',
  'outlook.cloud.microsoft',
  'mail.google.com',
  'gmail.com',
  'mail.yahoo.com',
  'protonmail.com',
  'proton.me',
  'icloud.com',
  'fastmail.com',
] as const

/** Email path patterns (substring match on full URL). */
export const EMAIL_PATHS = ['/mail/', '/inbox', '/messages', '/compose'] as const

/**
 * Returns true if the URL is an email/webmail URL (hardcoded domain + path check).
 * Uses substring match so outlook.cloud.microsoft and mail.google.com/#inbox are detected.
 */
export function isEmailUrl(url: string | null | undefined): boolean {
  if (!url) return false

  const lowerUrl = url.toLowerCase()

  for (const domain of EMAIL_DOMAINS) {
    if (lowerUrl.includes(domain)) {
      logger.debug('[EMAIL DETECT] Matched domain:', domain)
      return true
    }
  }

  for (const path of EMAIL_PATHS) {
    if (lowerUrl.includes(path)) {
      logger.debug('[EMAIL DETECT] Matched path:', path)
      return true
    }
  }

  return false
}

/** @deprecated Use EMAIL_DOMAINS for new code. Kept for backwards compatibility. */
export const KNOWN_WEBMAIL_DOMAINS = [...EMAIL_DOMAINS] as const

export interface WebmailApp {
  name: string
  domains: string[]
}

export interface DesktopEmailApp {
  name: string
  processNames: string[]
}

export interface BrowserApp {
  name: string
  processNames: string[]
}

export const EMAIL_APPLICATIONS = {
  webmail: [
    { name: 'Gmail', domains: ['mail.google.com'] },
    { name: 'Outlook', domains: ['outlook.office.com'] },
  ],
  desktop: [],
  browsers: [
    { name: 'Google Chrome', processNames: ['Google Chrome', 'Chrome'] },
    { name: 'Safari', processNames: ['Safari'] },
    { name: 'Microsoft Edge', processNames: ['msedge', 'Microsoft Edge'] },
    { name: 'Brave', processNames: ['Brave'] },
  ],
} as const

/** Result of checking if the active window is an email application. */
export interface EmailAppCheckResult {
  isEmail: boolean
  appType: 'webmail' | 'desktop' | null
  appName: string | null
  url?: string
}

/**
 * Check if the given window info corresponds to an email application (webmail via URL or desktop by process name).
 * When url is present, uses isEmailUrl (hardcoded domain + path check). Otherwise checks desktop process names.
 */
export function isEmailApplication(windowInfo: ActiveWindowInfo): EmailAppCheckResult {
  const nameLower = (windowInfo.owner?.name ?? '').toLowerCase()
  const url = windowInfo.url?.trim() ?? ''

  if (url) {
    if (isEmailUrl(url)) {
      const host = getHostFromUrl(url)
      let appName: string | null = null
      for (const app of EMAIL_APPLICATIONS.webmail) {
        const matches = app.domains.some((d) => {
          const domainHost = d.split('/')[0]
          return host === domainHost || host?.endsWith('.' + domainHost)
        })
        if (matches) {
          appName = app.name
          break
        }
      }
      if (!appName && host) {
        if (host.includes('google') && (host.includes('mail') || host.includes('gmail'))) appName = 'Gmail'
        else if (host.includes('outlook') || host.includes('microsoft')) appName = 'Outlook'
        else if (host.includes('yahoo')) appName = 'Yahoo Mail'
        else if (host.includes('proton')) appName = 'Proton Mail'
        else if (host.includes('icloud')) appName = 'iCloud Mail'
        else if (host.includes('zoho')) appName = 'Zoho Mail'
      }
      return {
        isEmail: true,
        appType: 'webmail',
        appName: appName ?? 'Webmail',
        url: windowInfo.url,
      }
    }
  }

  // Desktop email clients by process name
  for (const app of EMAIL_APPLICATIONS.desktop) {
    const matches = app.processNames.some(
      (p) => nameLower === p.toLowerCase() || nameLower.includes(p.toLowerCase())
    )
    if (matches) {
      return {
        isEmail: true,
        appType: 'desktop',
        appName: app.name,
        url: windowInfo.url,
      }
    }
  }

  return { isEmail: false, appType: null, appName: null }
}

/** All Outlook web domains for URL matching (substring match). */
export const OUTLOOK_WEB_DOMAINS = [
  'outlook.office.com',
  'outlook.live.com',
  'outlook.office365.com',
  'outlook.cloud.microsoft',
]

/** Process name patterns that indicate Outlook desktop (case-insensitive substring match). */
export const OUTLOOK_DESKTOP_PROCESS_NAMES = ['outlook', 'microsoft outlook']
