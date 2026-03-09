/**
 * Parses webmail URLs to determine user context (inbox, compose, reading email, etc.).
 */

export type WebmailSection =
  | 'inbox'
  | 'email'
  | 'compose'
  | 'sent'
  | 'drafts'
  | 'spam'
  | 'trash'
  | 'settings'
  | 'unknown'

export interface EmailUrlContext {
  service: string
  section: WebmailSection
  emailId?: string
  isThread?: boolean
  path?: string
}

/**
 * Parse Gmail URL to determine section and optional message/thread id.
 * Patterns: /#inbox, /#inbox/threadId, /#compose, /mail/u/0/#inbox, /mail/u/0/#label/...
 */
export function parseGmailUrl(url: string): {
  section: WebmailSection
  emailId?: string
  isThread?: boolean
} {
  if (!url || typeof url !== 'string') return { section: 'unknown' }
  const u = url.trim().toLowerCase()
  if (!u.includes('mail.google.com') && !u.includes('gmail.com') && !u.includes('inbox.google.com')) {
    return { section: 'unknown' }
  }
  try {
    const hashIndex = u.indexOf('#')
    const hash = hashIndex >= 0 ? u.slice(hashIndex + 1) : ''
    const pathPart = hashIndex >= 0 ? u.slice(0, hashIndex) : u
    const pathMatch = pathPart.match(/\/mail\/u\/\d+(?:\/(.+?))?(?:\?|$)/)
    const pathAfterMail = pathMatch ? (pathMatch[1] ?? '') : ''

    if (hash.startsWith('inbox') || hash === 'inbox') {
      const parts = hash.split('/').filter(Boolean)
      if (parts.length >= 2 && parts[0] === 'inbox') {
        return { section: 'email', emailId: parts[1], isThread: true }
      }
      return { section: 'inbox' }
    }
    if (hash.startsWith('compose') || hash === 'compose') return { section: 'compose' }
    if (hash.startsWith('sent') || hash === 'sent') return { section: 'sent' }
    if (hash.startsWith('drafts') || hash === 'drafts') return { section: 'drafts' }
    if (hash.startsWith('spam') || hash === 'spam') return { section: 'spam' }
    if (hash.startsWith('trash') || hash === 'trash') return { section: 'trash' }
    if (hash.startsWith('settings') || hash.includes('/settings') || pathAfterMail.startsWith('settings')) {
      return { section: 'settings' }
    }
    if (hash.startsWith('label/') || hash.startsWith('category/')) {
      const rest = hash.split('/').slice(1)
      if (rest[0] === 'sent') return { section: 'sent' }
      if (rest[0] === 'draft') return { section: 'drafts' }
      if (rest[0] === 'spam') return { section: 'spam' }
      if (rest[0] === 'trash') return { section: 'trash' }
      if (rest.length >= 2) return { section: 'email', emailId: rest[1], isThread: true }
      return { section: 'inbox' }
    }
    if (hash && hash !== 'all' && hash !== 'primary' && hash !== 'social' && hash !== 'promotions') {
      const parts = hash.split('/')
      if (parts.length >= 2) return { section: 'email', emailId: parts[1], isThread: true }
    }
    return { section: 'inbox' }
  } catch {
    return { section: 'unknown' }
  }
}

/**
 * Parse Outlook (outlook.live.com, outlook.office.com, etc.) URL.
 * Paths: /mail/.../inbox, /mail/.../read/id, /mail/0/.../compose, /options/mail
 */
export function parseOutlookUrl(url: string): {
  section: WebmailSection
  emailId?: string
  isThread?: boolean
} {
  if (!url || typeof url !== 'string') return { section: 'unknown' }
  const u = url.trim().toLowerCase()
  const outlookDomains = ['outlook.live.com', 'outlook.office.com', 'outlook.office365.com', 'outlook.com', 'cloud.microsoft.com']
  if (!outlookDomains.some((d) => u.includes(d))) return { section: 'unknown' }
  try {
    const pathMatch = u.match(/https?:\/\/[^/]+\/([^#?]+)/)
    const path = pathMatch ? pathMatch[1] : ''
    const segments = path.split('/').filter(Boolean)
    if (path.includes('/inbox') || segments.includes('inbox')) return { section: 'inbox' }
    if (path.includes('/sent')) return { section: 'sent' }
    if (path.includes('/drafts') || path.includes('/draft')) return { section: 'drafts' }
    if (path.includes('/junk') || path.includes('/spam')) return { section: 'spam' }
    if (path.includes('/deleted') || path.includes('/trash')) return { section: 'trash' }
    if (path.includes('/read/') || path.includes('/message/') || path.includes('/messages/')) {
      const idSegment = segments.find((s, i) => (segments[i - 1] === 'read' || segments[i - 1] === 'message' || segments[i - 1] === 'messages') && s && s.length > 10)
      return { section: 'email', emailId: idSegment, isThread: false }
    }
    if (path.includes('/compose') || path.includes('/new') || path.includes('/mail/0/')) return { section: 'compose' }
    if (path.includes('/options') || path.includes('/settings')) return { section: 'settings' }
    if (path.includes('/mail')) return { section: 'inbox' }
    return { section: 'unknown' }
  } catch {
    return { section: 'unknown' }
  }
}

/**
 * Parse Yahoo Mail URL.
 * Paths: /inbox, /read/..., /compose, /drafts, /sent, /trash
 */
export function parseYahooUrl(url: string): {
  section: WebmailSection
  emailId?: string
  isThread?: boolean
} {
  if (!url || typeof url !== 'string') return { section: 'unknown' }
  const u = url.trim().toLowerCase()
  if (!u.includes('mail.yahoo.com')) return { section: 'unknown' }
  try {
    const pathMatch = u.match(/https?:\/\/[^/]+\/([^#?]+)/)
    const path = pathMatch ? pathMatch[1] : ''
    if (path.startsWith('inbox') || path === '') return { section: 'inbox' }
    if (path.startsWith('read/') || path.startsWith('message/')) {
      const parts = path.split('/')
      return { section: 'email', emailId: parts[1], isThread: false }
    }
    if (path.startsWith('compose')) return { section: 'compose' }
    if (path.startsWith('drafts')) return { section: 'drafts' }
    if (path.startsWith('sent')) return { section: 'sent' }
    if (path.startsWith('trash') || path.startsWith('bulk')) return { section: 'trash' }
    if (path.startsWith('spam')) return { section: 'spam' }
    if (path.startsWith('settings') || path.startsWith('options')) return { section: 'settings' }
    return { section: 'inbox' }
  } catch {
    return { section: 'unknown' }
  }
}

/**
 * Parse Proton Mail URL.
 * Paths: /inbox, /inbox/msgid, /compose, /drafts, /sent, /trash, /spam, /settings
 */
export function parseProtonUrl(url: string): {
  section: WebmailSection
  emailId?: string
  isThread?: boolean
} {
  if (!url || typeof url !== 'string') return { section: 'unknown' }
  const u = url.trim().toLowerCase()
  if (!u.includes('protonmail') && !u.includes('proton.me')) return { section: 'unknown' }
  try {
    const pathMatch = u.match(/https?:\/\/[^/]+\/([^#?]+)/)
    const path = pathMatch ? pathMatch[1] : ''
    const hashMatch = u.match(/#([^?]+)/)
    const hash = hashMatch ? hashMatch[1] : ''
    const pathOrHash = (path || hash).split('/').filter(Boolean)
    if (pathOrHash[0] === 'inbox') {
      if (pathOrHash.length >= 2) return { section: 'email', emailId: pathOrHash[1], isThread: false }
      return { section: 'inbox' }
    }
    if (pathOrHash[0] === 'compose') return { section: 'compose' }
    if (pathOrHash[0] === 'drafts') return { section: 'drafts' }
    if (pathOrHash[0] === 'sent') return { section: 'sent' }
    if (pathOrHash[0] === 'trash') return { section: 'trash' }
    if (pathOrHash[0] === 'spam') return { section: 'spam' }
    if (pathOrHash[0] === 'settings') return { section: 'settings' }
    if (path.includes('mail')) return { section: 'inbox' }
    return { section: 'unknown' }
  } catch {
    return { section: 'unknown' }
  }
}

/**
 * Extract email context from any supported webmail URL.
 * Returns service name, section (inbox/compose/email/etc.), and optional email/thread id.
 */
export function extractEmailContext(url: string): EmailUrlContext {
  if (!url || typeof url !== 'string') {
    return { service: 'unknown', section: 'unknown' }
  }
  const u = url.trim()
  const lower = u.toLowerCase()
  if (lower.includes('mail.google.com') || lower.includes('gmail.com') || lower.includes('inbox.google.com')) {
    const parsed = parseGmailUrl(u)
    return { service: 'Gmail', section: parsed.section, emailId: parsed.emailId, isThread: parsed.isThread, path: u }
  }
  if (
    lower.includes('outlook.live.com') ||
    lower.includes('outlook.office.com') ||
    lower.includes('outlook.office365.com') ||
    lower.includes('outlook.com') ||
    lower.includes('cloud.microsoft.com')
  ) {
    const parsed = parseOutlookUrl(u)
    return { service: 'Outlook', section: parsed.section, emailId: parsed.emailId, isThread: parsed.isThread, path: u }
  }
  if (lower.includes('mail.yahoo.com')) {
    const parsed = parseYahooUrl(u)
    return { service: 'Yahoo Mail', section: parsed.section, emailId: parsed.emailId, isThread: parsed.isThread, path: u }
  }
  if (lower.includes('protonmail') || lower.includes('proton.me')) {
    const parsed = parseProtonUrl(u)
    return { service: 'Proton Mail', section: parsed.section, emailId: parsed.emailId, isThread: parsed.isThread, path: u }
  }
  if (lower.includes('icloud.com/mail')) {
    return { service: 'iCloud Mail', section: 'inbox', path: u }
  }
  if (lower.includes('zoho.com/mail')) {
    return { service: 'Zoho Mail', section: 'inbox', path: u }
  }
  return { service: 'unknown', section: 'unknown' }
}
