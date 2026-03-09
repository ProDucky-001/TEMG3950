/**
 * Unit tests for URL helpers used in screen capture debug logging.
 */
import { isRealUrl, isValidURL } from '../../src/main/utils/urlUtils';

describe('urlUtils.isRealUrl', () => {
  it('returns true for https URLs', () => {
    expect(isRealUrl('https://mail.google.com/mail/u/0')).toBe(true);
    expect(isRealUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('returns true for http URLs', () => {
    expect(isRealUrl('http://outlook.office.com')).toBe(true);
  });

  it('returns false for null or undefined', () => {
    expect(isRealUrl(null)).toBe(false);
    expect(isRealUrl(undefined)).toBe(false);
  });

  it('returns false for bookmark-like labels (no protocol)', () => {
    expect(isRealUrl('Inbox')).toBe(false);
    expect(isRealUrl('Google Docs')).toBe(false);
    expect(isRealUrl('mail.google.com')).toBe(false);
  });

  it('returns false for empty or whitespace', () => {
    expect(isRealUrl('')).toBe(false);
    expect(isRealUrl('   ')).toBe(false);
  });

  it('returns false for very long strings', () => {
    const long = 'https://example.com/' + 'a'.repeat(2000);
    expect(isRealUrl(long)).toBe(false);
  });
});

describe('urlUtils.isValidURL', () => {
  it('returns true for valid https URL', () => {
    expect(isValidURL('https://mail.google.com/mail/u/0')).toBe(true);
    expect(isValidURL('http://outlook.office.com')).toBe(true);
  });

  it('returns true for domain without scheme (normalized to https)', () => {
    expect(isValidURL('outlook.live.com')).toBe(true);
  });

  it('returns false for empty or invalid', () => {
    expect(isValidURL('')).toBe(false);
    expect(isValidURL(null)).toBe(false);
    expect(isValidURL('Inbox')).toBe(false);
    expect(isValidURL('x')).toBe(false);
  });
});
