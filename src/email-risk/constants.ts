/**
 * Constants: regex patterns, brand lists, and config for phishing detection.
 */

/** Brands to check for misspellings / lookalike domains. */
export const BRAND_NAMES = [
  'microsoft',
  'onedrive',
  'google',
  'gmail',
  'apple',
  'icloud',
  'amazon',
  'paypal',
  'netflix',
  'dropbox',
  'linkedin',
  'facebook',
  'instagram',
  'whatsapp',
  'outlook',
  'office365',
  'adobe',
  'spotify',
  'bankofamerica',
  'chase',
  'wellsfargo',
  'coinbase',
  'binance',
] as const;

/** Common character substitutions in homograph attacks. */
export const LOOKALIKE_MAP: Record<string, string[]> = {
  o: ['0', 'q'],
  l: ['1', 'i'],
  i: ['1', 'l'],
  s: ['5', '$'],
  a: ['4', '@'],
  e: ['3'],
  m: ['rn', 'nn'],
  n: ['rn', 'm'],
};

/** Suspicious TLDs often used in phishing. */
export const SUSPICIOUS_TLDS = new Set([
  '.xyz',
  '.top',
  '.click',
  '.link',
  '.tk',
  '.ml',
  '.ga',
  '.cf',
  '.gq',
  '.work',
  '.buzz',
  '.online',
  '.site',
  '.website',
  '.space',
  '.pw',
  '.cc',
  '.ws',
]);

/** URL shortener domains. */
export const URL_SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'cutt.ly',
  'short.link',
  'rebrand.ly',
]);

/** Risky attachment extensions. */
export const RISKY_EXTENSIONS = new Set([
  '.exe',
  '.scr',
  '.zip',
  '.js',
  '.vbs',
  '.bat',
  '.cmd',
  '.msi',
  '.jar',
  '.wsf',
  '.hta',
  '.ps1',
]);

/** Phishing pattern groups: storage/quota, account threats, payment, password. */
export const PHISHING_PATTERNS = {
  storage: [
    /one\s*drive\s+(is\s+)?full/i,
    /onedrive\s+(is\s+)?full/i,
    /mailbox\s+storage\s+exceeded/i,
    /storage\s+(has\s+)?exceeded/i,
    /google\s+drive\s+quota/i,
    /drive\s+quota\s+(exceeded|reached)/i,
    /icloud\s+storage\s+limit/i,
    /storage\s+limit\s+reached/i,
    /quota\s+exceeded/i,
    /out\s+of\s+storage/i,
  ],
  accountSuspension: [
    /account\s+will\s+be\s+suspended/i,
    /account\s+has\s+been\s+suspended/i,
    /verify\s+your\s+account\s+immediately/i,
    /account\s+has\s+been\s+compromised/i,
    /account\s+compromised/i,
    /suspended\s+account/i,
    /reactivate\s+your\s+account/i,
    /account\s+verification\s+required/i,
    /confirm\s+your\s+identity/i,
  ],
  payment: [
    /payment\s+failed/i,
    /update\s+(your\s+)?billing\s+information/i,
    /invoice\s+attached/i,
    /billing\s+problem/i,
    /payment\s+declined/i,
    /update\s+payment\s+method/i,
    /subscription\s+expired/i,
    /renew\s+your\s+subscription/i,
  ],
  password: [
    /password\s+expires/i,
    /reset\s+your\s+password\s+now/i,
    /security\s+alert/i,
    /password\s+reset\s+required/i,
    /change\s+your\s+password/i,
    /unusual\s+activity\s+on\s+your\s+account/i,
    /sign-in\s+attempt/i,
  ],
} as const;

/** Urgency / threat language patterns. */
export const URGENCY_PATTERNS = {
  timePressure: [
    /within\s+\d+\s*(hours?|minutes?|days?)/i,
    /immediate\s+action\s+required/i,
    /expires\s+today/i,
    /act\s+now/i,
    /urgent\s+action/i,
    /deadline\s+is/i,
    /before\s+midnight/i,
    /only\s+\d+\s*(hours?|days?)\s+left/i,
  ],
  threat: [
    /will\s+be\s+terminated/i,
    /permanently\s+deleted/i,
    /lose\s+access/i,
    /account\s+(will\s+be\s+)?suspended/i,
    /closed\s+within/i,
    /final\s+warning/i,
    /last\s+chance/i,
  ],
  scarcity: [
    /limited\s+time/i,
    /only\s+\d+\s*(hours?|days?)\s+remaining/i,
    /final\s+notice/i,
    /don't\s+miss\s+out/i,
  ],
  capsExclam: [
    /!!+/g,
    /(?:^|\s)([A-Z][A-Z\s]{10,})(?:\s|$|[.!?])/gm,
  ],
};

/** Generic greeting patterns (medium priority). */
export const GENERIC_GREETINGS = [
  /dear\s+customer/i,
  /dear\s+user/i,
  /dear\s+sir\/madam/i,
  /dear\s+valued\s+customer/i,
  /hello\s+customer/i,
  /good\s+(morning|afternoon|day)\s+user/i,
];

/** Sensitive data request patterns. */
export const SENSITIVE_REQUEST_PATTERNS = [
  /(?:enter|provide|send|submit)\s+(?:your\s+)?(?:password|social\s+security|ssn|credit\s+card|pin\s+number|bank\s+account)/i,
  /(?:password|ssn|credit\s+card|pin)\s*(?:number)?\s*:\s*/i,
  /verify\s+your\s+(?:identity|account)\s+by\s+entering/i,
  /confirm\s+your\s+(?:credit\s+card|bank)\s+details/i,
];

/** IPv4 regex for URL host. */
export const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/** Subdomain count threshold (excessive = suspicious). */
export const MAX_SUBDOMAINS_NORMAL = 2;
