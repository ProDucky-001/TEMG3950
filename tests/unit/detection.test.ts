/**
 * Unit tests for Outlook detection, URL-area OCR parsing, and email detection pipeline.
 */
import { OUTLOOK_WEB_DOMAINS, EMAIL_APPLICATIONS } from '../../src/main/detection/EmailPatterns'
import { OutlookDetector } from '../../src/main/detection/OutlookDetector'
import { URLAreaOCR } from '../../src/main/detection/URLAreaOCR'
import { FullWidthOCRScanner } from '../../src/main/detection/FullWidthOCRScanner'
import { EmailDetectionPipeline } from '../../src/main/detection/EmailDetectionPipeline'
import type { AppContextResult } from '../../src/main/integration/AppContextDetector'

describe('EmailPatterns', () => {
  it('includes Outlook Web domains', () => {
    expect(OUTLOOK_WEB_DOMAINS).toContain('outlook.live.com')
    expect(OUTLOOK_WEB_DOMAINS).toContain('outlook.office.com')
    expect(OUTLOOK_WEB_DOMAINS).toContain('outlook.com')
    expect(OUTLOOK_WEB_DOMAINS).toContain('outlook.office365.com')
  })

  it('EMAIL_APPLICATIONS has Outlook web and desktop', () => {
    const webOutlook = EMAIL_APPLICATIONS.webmail.find((w) => w.name === 'Outlook')
    expect(webOutlook).toBeDefined()
    expect(webOutlook!.domains).toContain('outlook.live.com')
    const desktopOutlook = EMAIL_APPLICATIONS.desktop.find((d) => d.name === 'Microsoft Outlook')
    expect(desktopOutlook).toBeDefined()
    expect(desktopOutlook!.processNames.some((p) => p.toLowerCase().includes('outlook'))).toBe(true)
  })
})

describe('OutlookDetector', () => {
  const detector = new OutlookDetector()

  describe('detectDesktopOutlook', () => {
    it('detects Outlook desktop by process name', () => {
      expect(detector.detectDesktopOutlook('Microsoft Outlook')).toBe(true)
      expect(detector.detectDesktopOutlook('OUTLOOK')).toBe(true)
      expect(detector.detectDesktopOutlook('Outlook')).toBe(true)
    })
    it('returns false for non-Outlook', () => {
      expect(detector.detectDesktopOutlook('Chrome')).toBe(false)
      expect(detector.detectDesktopOutlook('Mail')).toBe(false)
      expect(detector.detectDesktopOutlook('')).toBe(false)
    })
  })

  describe('detectOutlookWeb', () => {
    it('detects outlook.live.com', () => {
      expect(detector.detectOutlookWeb('https://outlook.live.com/mail/')).toBe(true)
      expect(detector.detectOutlookWeb('outlook.live.com')).toBe(true)
    })
    it('detects outlook.office.com', () => {
      expect(detector.detectOutlookWeb('https://outlook.office.com/mail/')).toBe(true)
    })
    it('returns false for non-Outlook URLs', () => {
      expect(detector.detectOutlookWeb('https://mail.google.com')).toBe(false)
      expect(detector.detectOutlookWeb('')).toBe(false)
    })
  })

  describe('getOutlookContext', () => {
    it('returns compose for compose/new message', () => {
      expect(detector.getOutlookContext('New Message - Outlook').section).toBe('compose')
      expect(detector.getOutlookContext('', 'https://outlook.com/compose').section).toBe('compose')
    })
    it('returns inbox for inbox/mail', () => {
      expect(detector.getOutlookContext('Inbox - Outlook').section).toBe('inbox')
    })
    it('returns calendar for calendar', () => {
      expect(detector.getOutlookContext('Calendar - Outlook').section).toBe('calendar')
    })
    it('returns settings for settings', () => {
      expect(detector.getOutlookContext('Settings - Outlook').section).toBe('settings')
    })
  })
})

describe('URLAreaOCR', () => {
  const urlAreaOCR = new URLAreaOCR()
  const bounds = { x: 100, y: 50, width: 800, height: 600 }

  it('getURLBarRegion returns region with positive dimensions', () => {
    const chrome = urlAreaOCR.getURLBarRegion(bounds, 'chrome')
    expect(chrome.width).toBeGreaterThan(0)
    expect(chrome.height).toBeGreaterThan(0)
    expect(chrome.x).toBeGreaterThanOrEqual(bounds.x)
    const outlook = urlAreaOCR.getURLBarRegion(bounds, 'outlook')
    expect(outlook.y).toBe(bounds.y + 80)
  })

  describe('parseURLFromText', () => {
    it('extracts URL with scheme', () => {
      expect(urlAreaOCR.parseURLFromText('  https://mail.google.com/mail/u/0  ')).toBe(
        'https://mail.google.com/mail/u/0'
      )
    })
    it('extracts domain-like without scheme', () => {
      expect(urlAreaOCR.parseURLFromText('outlook.office.com/mail/inbox')).toBe(
        'outlook.office.com/mail/inbox'
      )
    })
    it('returns undefined for no URL', () => {
      expect(urlAreaOCR.parseURLFromText('Inbox  Mail  Compose')).toBeUndefined()
      expect(urlAreaOCR.parseURLFromText('')).toBeUndefined()
    })
  })
})

describe('FullWidthOCRScanner', () => {
  const scanner = new FullWidthOCRScanner()
  const bounds = { x: 0, y: 0, width: 1000, height: 700 }

  it('getTopBarY returns y offset per app', () => {
    const yChrome = scanner.getTopBarY(bounds, 'chrome')
    const yOutlook = scanner.getTopBarY(bounds, 'outlook')
    expect(yOutlook).toBe(80)
    expect(yChrome).toBeGreaterThanOrEqual(bounds.y)
  })

  it('getTopBarHeight returns height per app', () => {
    expect(scanner.getTopBarHeight('chrome')).toBe(35)
    expect(scanner.getTopBarHeight('outlook')).toBe(45)
    expect(scanner.getTopBarHeight('unknown')).toBe(35)
  })

  it('extractURLs returns all https? URLs', () => {
    const text = 'Bar https://evil.com/path and http://safe.org'
    expect(scanner.extractURLs(text)).toEqual(['https://evil.com/path', 'http://safe.org'])
  })

  it('buildResultFromText includes fullText, lines, words, urls', () => {
    const text = 'https://outlook.live.com/mail/  Inbox'
    const result = scanner.buildResultFromText(text, 0.9)
    expect(result.fullText).toBe(text)
    expect(result.urls).toContain('https://outlook.live.com/mail/')
    expect(result.confidence).toBe(0.9)
  })
})

describe('EmailDetectionPipeline', () => {
  const pipeline = new EmailDetectionPipeline()

  function makeContext(overrides: Partial<AppContextResult>): AppContextResult {
    return {
      isEmailClientActive: false,
      appId: null,
      context: 'unknown',
      browserUrl: null,
      windowName: '',
      ...overrides,
    }
  }

  it('uses browserUrl when present and valid', () => {
    const ctx = makeContext({
      isEmailClientActive: true,
      appId: 'outlook',
      browserUrl: 'https://outlook.office.com/mail/',
    })
    const result = pipeline.processFromOCR(ctx, 'Some OCR text with url', 0)
    expect(result.detectedURL).toBe('https://outlook.office.com/mail/')
    expect(result.isEmail).toBe(true)
    expect(result.appId).toBe('outlook')
  })

  it('parses URL from OCR text when no browserUrl', () => {
    const ctx = makeContext({ isEmailClientActive: true, appId: 'chrome' })
    const result = pipeline.processFromOCR(
      ctx,
      '  https://outlook.live.com/mail/0/inbox  '
    )
    expect(result.detectedURL).toBe('https://outlook.live.com/mail/0/inbox')
    expect(result.urls.length).toBeGreaterThanOrEqual(1)
  })

  it('extracts multiple URLs in fullText', () => {
    const ctx = makeContext({ isEmailClientActive: true, appId: 'chrome' })
    const ocrText = 'First https://a.com and then https://b.com'
    const result = pipeline.processFromOCR(ctx, ocrText)
    expect(result.urls).toContain('https://a.com')
    expect(result.urls).toContain('https://b.com')
  })

  it('returns isEmail false when context says not email', () => {
    const ctx = makeContext({ isEmailClientActive: false, appId: 'chrome' })
    const result = pipeline.processFromOCR(ctx, 'https://outlook.live.com')
    expect(result.isEmail).toBe(false)
    expect(result.detectedURL).toBe('https://outlook.live.com')
  })
})
