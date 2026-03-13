/**
 * Set-based O(1) lookups for known values. No regex in hot path for these.
 */

export const SUSPICIOUS_TLDS = new Set([
  '.xyz', '.top', '.click', '.link', '.tk', '.ml', '.ga', '.cf', '.gq',
  '.work', '.buzz', '.online', '.site', '.website', '.space', '.pw', '.cc', '.ws',
]);

export const URL_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'cutt.ly',
  'short.link', 'rebrand.ly',
]);

export const RISKY_EXTENSIONS = new Set([
  '.exe', '.scr', '.zip', '.js', '.vbs', '.bat', '.cmd', '.msi', '.jar',
  '.wsf', '.hta', '.ps1',
]);

export const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'aol.com', 'mail.com', 'protonmail.com', 'yandex.com', 'gmx.com', 'zoho.com',
]);

/** Corporate-like words in display name (for sender check) */
export const CORPORATE_NAMES = new Set([
  'microsoft', 'apple', 'google', 'amazon', 'paypal', 'netflix', 'bank',
  'chase', 'wells fargo', 'support', 'security', 'account', 'billing', 'noreply', 'no-reply',
]);

export const MAX_URLS_TO_ANALYZE = 10;
export const MAX_SUBDOMAINS_NORMAL = 2;
export const CRITICAL_THRESHOLD = 80;
