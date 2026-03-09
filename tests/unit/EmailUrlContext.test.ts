/**
 * Unit tests for webmail URL parsing (Gmail, Outlook, Yahoo, Proton) and extractEmailContext.
 */
import {
  parseGmailUrl,
  parseOutlookUrl,
  parseYahooUrl,
  parseProtonUrl,
  extractEmailContext,
} from '../../src/main/detection/EmailUrlContext'

describe('parseGmailUrl', () => {
  it('returns inbox for #inbox', () => {
    expect(parseGmailUrl('https://mail.google.com/mail/u/0/#inbox').section).toBe('inbox')
    expect(parseGmailUrl('https://mail.google.com/mail/u/0/#inbox').section).toBe('inbox')
  })

  it('returns email + thread id for #inbox/threadId', () => {
    const r = parseGmailUrl('https://mail.google.com/mail/u/0/#inbox/abc123')
    expect(r.section).toBe('email')
    expect(r.emailId).toBe('abc123')
    expect(r.isThread).toBe(true)
  })

  it('returns compose for #compose', () => {
    expect(parseGmailUrl('https://mail.google.com/mail/u/0/#compose').section).toBe('compose')
  })

  it('returns sent/drafts/spam/trash for label paths', () => {
    expect(parseGmailUrl('https://mail.google.com/mail/u/0/#sent').section).toBe('sent')
    expect(parseGmailUrl('https://mail.google.com/mail/u/0/#drafts').section).toBe('drafts')
    expect(parseGmailUrl('https://mail.google.com/mail/u/0/#spam').section).toBe('spam')
    expect(parseGmailUrl('https://mail.google.com/mail/u/0/#trash').section).toBe('trash')
  })

  it('returns unknown for non-Gmail URL', () => {
    expect(parseGmailUrl('https://example.com').section).toBe('unknown')
    expect(parseGmailUrl('').section).toBe('unknown')
  })
})

describe('parseOutlookUrl', () => {
  it('returns inbox for /inbox path', () => {
    expect(parseOutlookUrl('https://outlook.live.com/mail/0/inbox').section).toBe('inbox')
    expect(parseOutlookUrl('https://outlook.office.com/mail/inbox').section).toBe('inbox')
  })

  it('returns compose for /compose or /new', () => {
    expect(parseOutlookUrl('https://outlook.live.com/mail/0/compose').section).toBe('compose')
    expect(parseOutlookUrl('https://outlook.office.com/mail/new').section).toBe('compose')
  })

  it('returns sent/drafts/trash', () => {
    expect(parseOutlookUrl('https://outlook.live.com/mail/0/sent').section).toBe('sent')
    expect(parseOutlookUrl('https://outlook.live.com/mail/0/drafts').section).toBe('drafts')
    expect(parseOutlookUrl('https://outlook.live.com/mail/0/deleted').section).toBe('trash')
  })

  it('returns email for /read/id path', () => {
    const r = parseOutlookUrl('https://outlook.live.com/mail/0/read/msgid123')
    expect(r.section).toBe('email')
  })

  it('returns unknown for non-Outlook URL', () => {
    expect(parseOutlookUrl('https://mail.google.com').section).toBe('unknown')
  })
})

describe('parseYahooUrl', () => {
  it('returns inbox for base or /inbox', () => {
    expect(parseYahooUrl('https://mail.yahoo.com').section).toBe('inbox')
    expect(parseYahooUrl('https://mail.yahoo.com/inbox').section).toBe('inbox')
  })

  it('returns compose/drafts/sent/trash', () => {
    expect(parseYahooUrl('https://mail.yahoo.com/compose').section).toBe('compose')
    expect(parseYahooUrl('https://mail.yahoo.com/drafts').section).toBe('drafts')
    expect(parseYahooUrl('https://mail.yahoo.com/sent').section).toBe('sent')
    expect(parseYahooUrl('https://mail.yahoo.com/trash').section).toBe('trash')
  })

  it('returns email for /read/id', () => {
    const r = parseYahooUrl('https://mail.yahoo.com/read/msg123')
    expect(r.section).toBe('email')
    expect(r.emailId).toBe('msg123')
  })
})

describe('parseProtonUrl', () => {
  it('returns inbox for /inbox', () => {
    expect(parseProtonUrl('https://mail.protonmail.com/inbox').section).toBe('inbox')
  })

  it('returns email for /inbox/msgid', () => {
    const r = parseProtonUrl('https://mail.protonmail.com/inbox/msgid456')
    expect(r.section).toBe('email')
    expect(r.emailId).toBe('msgid456')
  })

  it('returns compose/sent/drafts/trash/spam/settings', () => {
    expect(parseProtonUrl('https://mail.protonmail.com/compose').section).toBe('compose')
    expect(parseProtonUrl('https://mail.protonmail.com/sent').section).toBe('sent')
    expect(parseProtonUrl('https://mail.protonmail.com/drafts').section).toBe('drafts')
    expect(parseProtonUrl('https://mail.protonmail.com/trash').section).toBe('trash')
    expect(parseProtonUrl('https://mail.protonmail.com/spam').section).toBe('spam')
    expect(parseProtonUrl('https://mail.protonmail.com/settings').section).toBe('settings')
  })
})

describe('extractEmailContext', () => {
  it('returns Gmail context for mail.google.com', () => {
    const ctx = extractEmailContext('https://mail.google.com/mail/u/0/#inbox')
    expect(ctx.service).toBe('Gmail')
    expect(ctx.section).toBe('inbox')
  })

  it('returns Outlook context for outlook.live.com', () => {
    const ctx = extractEmailContext('https://outlook.live.com/mail/0/inbox')
    expect(ctx.service).toBe('Outlook')
    expect(ctx.section).toBe('inbox')
  })

  it('returns Yahoo Mail context for mail.yahoo.com', () => {
    const ctx = extractEmailContext('https://mail.yahoo.com/inbox')
    expect(ctx.service).toBe('Yahoo Mail')
    expect(ctx.section).toBe('inbox')
  })

  it('returns Proton Mail context for protonmail', () => {
    const ctx = extractEmailContext('https://mail.protonmail.com/inbox')
    expect(ctx.service).toBe('Proton Mail')
    expect(ctx.section).toBe('inbox')
  })

  it('returns unknown for non-webmail URL', () => {
    const ctx = extractEmailContext('https://example.com/page')
    expect(ctx.service).toBe('unknown')
    expect(ctx.section).toBe('unknown')
  })

  it('returns unknown for empty or invalid input', () => {
    expect(extractEmailContext('').service).toBe('unknown')
    expect(extractEmailContext('  ').service).toBe('unknown')
  })
})
