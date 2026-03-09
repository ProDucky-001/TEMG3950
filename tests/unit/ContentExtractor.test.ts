/**
 * Unit tests for ContentExtractor link extraction used in debug log (OCR URL bar).
 */
import { ContentExtractor } from '../../src/main/integration/ContentExtractor';

describe('ContentExtractor.getFirstLinkForLog', () => {
  const extractor = new ContentExtractor();

  it('returns first full https URL from text', () => {
    const text = 'Some text https://mail.google.com/mail/u/0 more';
    expect(extractor.getFirstLinkForLog(text)).toBe('https://mail.google.com/mail/u/0');
  });

  it('returns domain-like string from OCR (no scheme) normalized to https', () => {
    const text = 'mail.google.com/mail/u/0/#inbox';
    expect(extractor.getFirstLinkForLog(text)).toBe('https://mail.google.com/mail/u/0/#inbox');
  });

  it('prefers URL in first 600 chars and truncates at whitespace', () => {
    const start = 'outlook.office.com/mail/';
    const rest = ' x'.repeat(500)
    const result = extractor.getFirstLinkForLog(start + rest)
    expect(result).toBe('https://outlook.office.com/mail/')
  });

  it('returns null when no URL-like content', () => {
    expect(extractor.getFirstLinkForLog('Inbox  Mail  Compose')).toBeNull();
    expect(extractor.getFirstLinkForLog('')).toBeNull();
  });
});
