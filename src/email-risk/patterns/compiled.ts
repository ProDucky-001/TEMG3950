/**
 * Pre-compiled regex patterns at module load. Single combined patterns where possible.
 * All patterns are compiled once; no regex creation in hot paths.
 */

/** Combined phishing: storage | account_suspension | payment | password | account_expired (one pass) */
export const PHISHING_COMBINED = /(?:one\s*drive\s+(?:is\s+)?full|onedrive\s+(?:is\s+)?full|mailbox\s+storage\s+exceeded|storage\s+(?:has\s+)?exceeded|google\s+drive\s+quota|drive\s+quota\s+(?:exceeded|reached)|icloud\s+storage\s+limit|storage\s+limit\s+reached|quota\s+exceeded|out\s+of\s+storage)|(?:account\s+will\s+be\s+suspended|account\s+has\s+been\s+suspended|verify\s+your\s+account\s+immediately|account\s+has\s+been\s+compromised|account\s+compromised|suspended\s+account|reactivate\s+your\s+account|account\s+verification\s+required|confirm\s+your\s+identity|account\s+services?\s+(?:has\s+)?expired|account\s+has\s+expired|services?\s+has\s+expired|upgraded\s+to\s+\w+\.\w+\s+as\s+.*\s+expired)|(?:payment\s+failed|update\s+(?:your\s+)?billing\s+information|invoice\s+attached|billing\s+problem|payment\s+declined|update\s+payment\s+method|subscription\s+expired|renew\s+your\s+subscription)|(?:password\s+expires|reset\s+your\s+password\s+now|security\s+alert|password\s+reset\s+required|change\s+your\s+password|unusual\s+activity\s+on\s+your\s+account|sign-in\s+attempt)/gi;

/** Shortener or suspicious TLD mentioned in body (e.g. "bit.ly" or "malware.xyz") */
export const TEXT_SHORTENER_OR_TLD = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|cutt\.ly|tinyurl)\b|\b\w+\.(xyz|top|click|link|tk|ml|ga|cf|gq)\b/gi;

/** Combined urgency: time pressure | threat | scarcity */
export const URGENCY_COMBINED = /(?:within\s+\d+\s*(?:hours?|minutes?|days?)|immediate\s+action\s+required|expires\s+today|act\s+now|urgent\s+action|deadline\s+is|before\s+midnight|only\s+\d+\s*(?:hours?|days?)\s+left)|(?:will\s+be\s+terminated|permanently\s+deleted|lose\s+access|account\s+(?:will\s+be\s+)?suspended|closed\s+within|final\s+warning|last\s+chance)|(?:limited\s+time|only\s+\d+\s*(?:hours?|days?)\s+remaining|final\s+notice|don't\s+miss\s+out)/gi;

/** Exclamation marks (urgency) */
export const URGENCY_EXCLAM = /!!+/g;

/** ALL CAPS phrase (urgency) */
export const URGENCY_CAPS = /(?:^|\s)([A-Z][A-Z\s]{10,})(?:\s|$|[.!?])/gm;

/** Combined content: generic greeting | sensitive request */
export const CONTENT_COMBINED = /(?:dear\s+customer|dear\s+user|dear\s+sir\/madam|dear\s+valued\s+customer|hello\s+customer|good\s+(?:morning|afternoon|day)\s+user)/gi;

/** Sensitive data request (run separately so both greeting and sensitive can be detected). */
export const CONTENT_SENSITIVE = /(?:enter|provide|send|submit)\s+(?:your\s+)?(?:password|social\s+security|ssn|credit\s+card|pin\s+number|bank\s+account)|(?:password|ssn|credit\s+card|pin)\s*(?:number)?\s*:\s*|verify\s+your\s+(?:identity|account)\s+by\s+entering|confirm\s+your\s+(?:credit\s+card|bank)\s+details/gi;

/** URL extraction */
export const URL_EXTRACT = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/** HTTP + sensitive path (for URL analysis) */
export const URL_HTTP_SENSITIVE = /^http:\/\//i;

/** IPv4 hostname */
export const IPV4_HOST = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/** Sensitive path keywords for HTTP check */
export const SENSITIVE_PATH = /login|signin|account|secure|verify|password|billing/i;
