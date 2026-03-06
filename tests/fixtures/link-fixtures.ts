/**
 * Sample test data for link detection tests.
 * Includes known phishing patterns, suspicious URLs, and legitimate URLs for false positive testing.
 */

/** Known phishing / malicious URL patterns (for testing detection) */
export const PHISHING_URLS = [
  'https://paypa1-login-secure.verify-account.tk/login',
  'https://amaz0n-account.ga/secure-signin',
  'https://apple-id.apple.com.verify.xyz/confirm',
  'https://microsoft-online.secure.work/oauth',
  'https://192.168.1.1/login',
  'https://bit.ly/3xYzPhish',
  'https://secure-bank-login.cc/verify?password=reset',
  'https://goo.gl/2k9phish',
  'https://claim-prize-winner.cf/claim',
  'https://wire-transfer-urgent.ga/send',
  'https://account-suspended.work/verify',
  'https://g00gle.com/login',
  'https://rnu.microsoft.com/secure',
] as const;

/** Legitimate-looking URLs that should not be flagged (false positive testing) */
export const LEGITIMATE_URLS = [
  'https://www.google.com/search?q=test',
  'https://github.com',
  'https://stackoverflow.com/questions/123',
  'https://www.apple.com/shop',
  'https://docs.microsoft.com/en-us/',
  'https://www.paypal.com/signin',
  'https://amazon.com/dp/B08N5WRWNW',
  'https://example.com',
  'https://sub.domain.example.org/path',
] as const;

/** Invalid or malformed inputs for edge cases */
export const INVALID_URLS = [
  '',
  '   ',
  'not-a-url',
  'javascript:alert(1)',
  'ftp://invalid..host/',
  'https://',
  '://missing-scheme.com',
] as const;

/** Typosquat-style domains (e.g. g00gle, paypa1) */
export const TYPOSQUAT_SAMPLES = [
  'https://g00gle.com/search',
  'https://paypa1.com/login',
  'https://amaz0n.com/account',
  'https://micros0ft.com/verify',
] as const;
