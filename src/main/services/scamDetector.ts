/**
 * Local scam detection engine: analyzes OCR text and URLs without any external API.
 * - Keyword pattern matching (urgent, financial, credential, threat).
 * - URL analysis: suspicious TLDs, shorteners, typosquatting (regex/pattern only).
 * - Configurable scoring and threshold; human-readable reasons and recommendations.
 */

export interface ScamDetectionResult {
  /** Overall scam probability score 0–100. */
  score: number
  /** Whether the content exceeded the alert threshold. */
  alert: boolean
  /** Human-readable explanation. */
  explanation: string
  /** Specific keywords or patterns that triggered. */
  triggers: string[]
  /** Suggested actions for the user. */
  recommendations: string[]
  /** Parsed URLs from text that were analyzed. */
  urlsAnalyzed: string[]
}

export interface ScamDetectorOptions {
  /** Score >= this value triggers alert. Default 60. */
  alertThreshold?: number
}

// --- Keyword patterns (local only) ---
const URGENT_PATTERNS = [
  /\burgent\b/i,
  /\bimmediately\b/i,
  /\bact\s*now\b/i,
  /\bexpires?\b/i,
  /\basap\b/i,
  /\bhurry\b/i,
  /\blast\s*chance\b/i,
  /\blimited\s*time\b/i,
  /\bdon't\s*delay\b/i,
]

const FINANCIAL_PATTERNS = [
  /\bwire\s*transfer\b/i,
  /\bbank\s*account\b/i,
  /\bverify\s*(your\s*)?(account|identity)\b/i,
  /\bsuspend(ed)?\s*(your\s*)?account\b/i,
  /\bpayment\s*(required|due)\b/i,
  /\brefund\b/i,
  /\binvoice\b/i,
  /\bwestern\s*union\b/i,
  /\bmoney\s*gram\b/i,
  /\bbitcoin\b/i,
  /\bcrypto(currency)?\b/i,
  /\bwallet\b/i,
]

const CREDENTIAL_PATTERNS = [
  /\bpassword\b/i,
  /\blogin\b/i,
  /\bverify\s*account\b/i,
  /\bsecurity\s*(alert|verification)\b/i,
  /\bconfirm\s*(your\s*)?(identity|account)\b/i,
  /\bcredentials?\b/i,
  /\bclick\s*here\s*to\s*log\s*in\b/i,
]

const THREAT_PATTERNS = [
  /\baccount\s*(will\s*be\s*)?closed\b/i,
  /\blegal\s*action\b/i,
  /\barrest\s*warrant\b/i,
  /\bpolice\b/i,
  /\birs\b/i,
  /\btax\s*authority\b/i,
  /\bsuspended?\b/i,
  /\bblocked?\b/i,
]

// --- Weights (no API; pattern-only) ---
const WEIGHT_URGENT = 25
const WEIGHT_FINANCIAL = 35
const WEIGHT_CREDENTIAL = 40
const WEIGHT_THREAT = 45
const WEIGHT_SUSPICIOUS_TLD = 35
const WEIGHT_SHORTENER = 20
const WEIGHT_TYPOSQUATTING = 40
const WEIGHT_IP_URL = 30

const SUSPICIOUS_TLDS = new Set([
  '.xyz', '.top', '.click', '.link', '.work', '.gq', '.ml', '.cf', '.ga',
  '.tk', '.pw', '.cc', '.ws', '.buzz', '.rest', '.club', '.info', '.biz',
  '.online', '.site', '.website', '.space', '.tech', '.store', '.shop',
])

const SHORTENER_DOMAINS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'cutt.ly', 'rebrand.ly', 'shorturl.at', 'j.mp', 'tr.im', 'adf.ly',
])

const LEGITIMATE_BRANDS = new Set([
  'google', 'amazon', 'microsoft', 'apple', 'paypal', 'facebook', 'netflix',
  'outlook', 'yahoo', 'chase', 'wellsfargo', 'bankofamerica', 'linkedin',
])

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/gi) ?? []
  const normalized = matches
    .map((s) => s.trim())
    .filter((s) => s.length >= 10 && s.length <= 2000)
  return [...new Set(normalized)]
}

function getTld(hostname: string): string {
  const lastDot = hostname.lastIndexOf('.')
  return lastDot === -1 ? '' : hostname.slice(lastDot).toLowerCase()
}

function isSuspiciousTld(url: URL): boolean {
  const tld = getTld(url.hostname)
  return SUSPICIOUS_TLDS.has(tld)
}

function isShortener(hostname: string): boolean {
  return SHORTENER_DOMAINS.has(hostname.toLowerCase())
}

function isIpHost(hostname: string): boolean {
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
  const ipv6 = /^\[?[0-9a-fA-F:]+\]?$/
  return ipv4.test(hostname) || ipv6.test(hostname.replace(/^\[|\]$/g, ''))
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

function possibleTyposquatting(hostname: string): string | null {
  const domainPart = hostname.replace(/^www\./, '').split('.')[0] ?? ''
  if (domainPart.length < 4) return null
  for (const brand of LEGITIMATE_BRANDS) {
    if (domainPart === brand) continue
    const lev = levenshtein(domainPart, brand)
    const maxLen = Math.max(domainPart.length, brand.length)
    if (maxLen > 0 && lev <= 2 && lev / maxLen < 0.4) return brand
  }
  return null
}

/**
 * Local scam detector: keyword + URL pattern matching only; no external API.
 */
export class ScamDetector {
  private readonly alertThreshold: number

  constructor(options: ScamDetectorOptions = {}) {
    this.alertThreshold = options.alertThreshold ?? 60
  }

  /**
   * Analyze OCR text and optional hover/copied URLs. Returns score, triggers, and reasons.
   */
  analyze(text: string, urlsFromHoverOrClipboard: string[] = []): ScamDetectionResult {
    const triggers: string[] = []
    let score = 0

    // Keyword matching
    for (const re of URGENT_PATTERNS) {
      const m = text.match(re)
      if (m) {
        triggers.push(`Urgent language: "${m[0].trim()}"`)
        score += WEIGHT_URGENT
        break
      }
    }
    for (const re of FINANCIAL_PATTERNS) {
      const m = text.match(re)
      if (m) {
        triggers.push(`Financial: "${m[0].trim()}"`)
        score += WEIGHT_FINANCIAL
        break
      }
    }
    for (const re of CREDENTIAL_PATTERNS) {
      const m = text.match(re)
      if (m) {
        triggers.push(`Credential: "${m[0].trim()}"`)
        score += WEIGHT_CREDENTIAL
        break
      }
    }
    for (const re of THREAT_PATTERNS) {
      const m = text.match(re)
      if (m) {
        triggers.push(`Threat: "${m[0].trim()}"`)
        score += WEIGHT_THREAT
        break
      }
    }

    const allUrls = [...extractUrls(text), ...urlsFromHoverOrClipboard.filter((u) => /^https?:\/\//i.test(u))]
    const urlsAnalyzed: string[] = []

    for (const urlStr of allUrls) {
      try {
        const url = new URL(urlStr)
        urlsAnalyzed.push(urlStr)
        const host = url.hostname.toLowerCase()

        if (isSuspiciousTld(url)) {
          triggers.push(`Suspicious TLD: ${getTld(host)}`)
          score += WEIGHT_SUSPICIOUS_TLD
        }
        if (isShortener(host)) {
          triggers.push('URL shortener (hidden destination)')
          score += WEIGHT_SHORTENER
        }
        if (isIpHost(host)) {
          triggers.push('IP address in URL')
          score += WEIGHT_IP_URL
        }
        const brand = possibleTyposquatting(host)
        if (brand) {
          triggers.push(`Possible typosquatting of "${brand}"`)
          score += WEIGHT_TYPOSQUATTING
        }
      } catch {
        // skip invalid URL
      }
    }

    score = Math.min(100, score)
    const alert = score >= this.alertThreshold
    const explanation = this.buildExplanation(triggers, score)
    const recommendations = this.buildRecommendations(triggers, alert)

    return {
      score,
      alert,
      explanation,
      triggers: [...new Set(triggers)],
      recommendations,
      urlsAnalyzed,
    }
  }

  setAlertThreshold(value: number): void {
    this.alertThreshold = Math.max(0, Math.min(100, value))
  }

  getAlertThreshold(): number {
    return this.alertThreshold
  }

  private buildExplanation(triggers: string[], score: number): string {
    if (triggers.length === 0) return 'No scam indicators detected.'
    return `Score ${score}: ${triggers.slice(0, 5).join('; ')}.`
  }

  private buildRecommendations(triggers: string[], alert: boolean): string[] {
    const list: string[] = []
    if (triggers.some((t) => /credential|password|login/i.test(t))) {
      list.push('Do not enter passwords or personal data.')
      list.push('Open the official site by typing the address yourself.')
    }
    if (triggers.some((t) => /financial|wire|transfer|payment/i.test(t))) {
      list.push('Do not send money or crypto based on this message.')
      list.push('Verify through official channels.')
    }
    if (triggers.some((t) => /threat|legal|account closed/i.test(t))) {
      list.push('Legitimate organizations do not threaten via email or link.')
      list.push('Contact the organization directly via their official website.')
    }
    if (alert && list.length === 0) {
      list.push('Proceed with caution and verify the source.')
    }
    if (list.length === 0) {
      list.push('No specific action required.')
    }
    return list
  }
}
