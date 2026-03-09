/**
 * Central email application patterns for detection (webmail domains and desktop process/window names).
 */

import type { ActiveWindowInfo } from './ActiveWindowInfo'

export interface WebmailApp {
  name: string
  domains: string[]
}

export interface DesktopEmailApp {
  name: string
  processNames: string[]
  windowTitles: string[]
}

export interface BrowserApp {
  name: string
  processNames: string[]
}

export const EMAIL_APPLICATIONS = {
  webmail: [
    { name: 'Gmail', domains: ['mail.google.com', 'gmail.com', 'inbox.google.com', 'accounts.google.com', 'google.com/mail'] },
    { name: 'Outlook', domains: ['outlook.live.com', 'outlook.office.com', 'outlook.com', 'outlook.office365.com', 'outlook.cloud.microsoft.com'] },
    { name: 'Yahoo Mail', domains: ['mail.yahoo.com'] },
    { name: 'Proton Mail', domains: ['mail.protonmail.com', 'protonmail.com', 'proton.me'] },
    { name: 'iCloud Mail', domains: ['icloud.com/mail'] },
    { name: 'Zoho Mail', domains: ['zoho.com/mail'] },
  ],

  desktop: [
    { name: 'Apple Mail', processNames: ['Mail', 'Apple Mail', 'Mail.app'], windowTitles: ['Mail', 'Apple Mail', 'Inbox', 'New Message'] },
    { name: 'Microsoft Outlook', processNames: ['Outlook', 'Microsoft Outlook', 'OUTLOOK'], windowTitles: ['Outlook', '- Outlook', 'Microsoft Outlook', 'Inbox - Outlook', 'Message - Outlook'] },
    { name: 'Thunderbird', processNames: ['thunderbird'], windowTitles: [] },
    { name: 'Spark', processNames: ['Spark'], windowTitles: [] },
    { name: 'Airmail', processNames: ['Airmail'], windowTitles: [] },
    { name: 'Postbox', processNames: ['Postbox'], windowTitles: [] },
  ],

  browsers: [
    { name: 'Google Chrome', processNames: ['Google Chrome', 'Chrome'] },
    { name: 'Safari', processNames: ['Safari'] },
    { name: 'Firefox', processNames: ['Firefox', 'firefox'] },
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
 */
export function isEmailApplication(windowInfo: ActiveWindowInfo): EmailAppCheckResult {
  const nameLower = (windowInfo.owner?.name ?? '').toLowerCase()
  const titleLower = (windowInfo.title ?? '').toLowerCase()
  const url = windowInfo.url?.trim().toLowerCase() ?? ''

  // Webmail: we need a browser and a matching URL
  if (url) {
    const withScheme = /^https?:\/\//i.test(url) ? url : 'https://' + url
    for (const app of EMAIL_APPLICATIONS.webmail) {
      const matches = app.domains.some((d) => withScheme.includes(d))
      if (matches) {
        return {
          isEmail: true,
          appType: 'webmail',
          appName: app.name,
          url: windowInfo.url,
        }
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

/** All Outlook web domains for URL matching (with optional subdomains). */
export const OUTLOOK_WEB_DOMAINS = [
  'outlook.live.com',
  'outlook.office.com',
  'outlook.com',
  'outlook.office365.com',
  'outlook.cloud.microsoft.com',
]

/** Process name patterns that indicate Outlook desktop (case-insensitive substring match). */
export const OUTLOOK_DESKTOP_PROCESS_NAMES = ['outlook', 'microsoft outlook']
