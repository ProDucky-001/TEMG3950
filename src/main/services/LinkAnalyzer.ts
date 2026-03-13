import type { ScamDatabase } from './ScamDatabase'
import {
  ThreatType,
  type RiskBreakdownItem,
} from '../../shared/link-detection-types'

const WEIGHTS = {
  knownMalicious: 55,
  suspiciousTld: 40,
  typosquatting: 40,
  urlShortener: 35,
  ipAddress: 30,
  excessiveSubdomains: 28,
  encodedChars: 20,
  loginParams: 40,
  cryptoWallet: 35,
  financialKeywords: 35,
  urgencyPhrases: 25,
  prizeLottery: 35,
  brandImpersonation: 45,
  emailProviderLookalike: 40,
} as const

const KNOWN_SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'adf.ly',
  'j.mp',
  'tr.im',
  'short.to',
  'cli.gs',
  'shorturl.at',
  'cutt.ly',
  'rebrand.ly',
])

/** Trusted base domains to reduce false positives. Known-malicious in DB overrides. */
const ALLOWLIST_BASE_DOMAINS = new Set([
  'google.com',
  'google.co.uk',
  'youtube.com',
  'github.com',
  'github.io',
  'microsoft.com',
  'apple.com',
  'amazon.com',
  'paypal.com',
  'facebook.com',
  'netflix.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'yahoo.com',
  'outlook.com',
  'office.com',
  'live.com',
  'dropbox.com',
  'adobe.com',
  'ebay.com',
  'wikipedia.org',
  'cloudflare.com',
  'stackoverflow.com',
  'reddit.com',
  'twitch.tv',
  'spotify.com',
  'zoom.us',
  'slack.com',
  'notion.so',
  'figma.com',
])

/** Known email-provider lookalikes (zmail, 0utlook, gmai1, etc.) – hostname stem only. */
const EMAIL_LOOKALIKE_STEMS = new Set([
  'zmail',
  '0utlook',
  'out1ook',
  'outlok',
  'gmai1',
  'grnail',
  'gnail',
  'gmal',
  'gmali',
  'gmaill',
  'gmeil',
  'yah00',
  'hotmali',
])

const COMMON_BRANDS = new Set([
  'google',
  'amazon',
  'microsoft',
  'apple',
  'paypal',
  'facebook',
  'netflix',
  'instagram',
  'twitter',
  'linkedin',
  'yahoo',
  'outlook',
  'office365',
  'dropbox',
  'adobe',
  'ebay',
  'wellsfargo',
  'chase',
  'bankofamerica',
])

const CREDENTIAL_PARAMS = new Set([
  'login',
  'password',
  'passwd',
  'pwd',
  'user',
  'username',
  'email',
  'credential',
  'signin',
  'auth',
  'token',
  'session',
  'verify',
])

const FINANCIAL_KEYWORDS = new Set([
  'wire',
  'transfer',
  'bank',
  'payment',
  'pay',
  'invoice',
  'refund',
  'westernunion',
  'moneygram',
  'bitcoin',
  'crypto',
  'wallet',
  'ethereum',
])

const URGENCY_PHRASES = new Set([
  'urgent',
  'actnow',
  'limited',
  'expire',
  'immediately',
  'asap',
  'hurry',
  'lastchance',
  'final',
])

const PRIZE_PHRASES = new Set([
  'winner',
  'prize',
  'lottery',
  'congratulations',
  'claim',
  'free',
  'giveaway',
  'inheritance',
])

const HOMOGLYPHS: Record<string, string> = {
  '\u0430': 'a',
  '\u0435': 'e',
  '\u043e': 'o',
  '\u043f': 'p',
  '\u0441': 'c',
  '\u0443': 'u',
  '\u0445': 'x',
  '\u044b': 'y',
  '\u0454': 'e',
  '\u0456': 'i',
  '\u0457': 'yi',
  '\u0491': 'g',
  '\u03b1': 'a',
  '\u03b5': 'e',
  '\u03bf': 'o',
}

export class LinkAnalyzer {
  constructor(private readonly scamDb: ScamDatabase) {}

  /**
   * Full analysis of a URL. Returns risk breakdown and threat types.
   */
  analyze(urlString: string): {
    breakdown: RiskBreakdownItem[]
    threatTypes: ThreatType[]
    explanation: string
    recommendations: string[]
  } {
    const breakdown: RiskBreakdownItem[] = []
    const threatTypes = new Set<ThreatType>()

    try {
      const url = new URL(urlString)
      const hostname = url.hostname.toLowerCase()
      const pathAndQuery = (url.pathname + url.search).toLowerCase()
      const baseDomain = this.getBaseDomain(hostname)
      const isAllowlisted = ALLOWLIST_BASE_DOMAINS.has(baseDomain)

      const known = this.checkKnownMaliciousDomain(hostname)
      if (known) {
        breakdown.push({
          category: 'Known malicious domain',
          score: WEIGHTS.knownMalicious,
          maxScore: WEIGHTS.knownMalicious,
          reason: `Domain is in the threat database (${known.threatType}).`,
        })
        threatTypes.add(known.threatType)
      }

      const tldResult = this.checkSuspiciousTld(url)
      if (tldResult) {
        breakdown.push(tldResult)
        threatTypes.add(ThreatType.Suspicious)
      }

      const typosquatResult = this.checkTyposquattingAndHomograph(hostname)
      if (typosquatResult) {
        breakdown.push(typosquatResult)
        threatTypes.add(ThreatType.Phishing)
      }

      const shortenerResult = this.checkUrlShortener(hostname)
      if (shortenerResult) {
        breakdown.push(shortenerResult)
        threatTypes.add(ThreatType.Suspicious)
      }

      const emailLookalikeResult = this.checkEmailProviderLookalike(hostname)
      if (emailLookalikeResult) {
        breakdown.push(emailLookalikeResult)
        threatTypes.add(ThreatType.Phishing)
      }

      const ipResult = this.checkIpAddress(hostname)
      if (ipResult) {
        breakdown.push(ipResult)
        threatTypes.add(ThreatType.Suspicious)
      }

      const subdomainResult = this.checkExcessiveSubdomains(hostname)
      if (subdomainResult) {
        breakdown.push(subdomainResult)
        threatTypes.add(ThreatType.Suspicious)
      }

      const encodedResult = this.checkEncodedCharacters(urlString)
      if (encodedResult) {
        breakdown.push(encodedResult)
        threatTypes.add(ThreatType.Suspicious)
      }

      const loginResult = this.checkLoginCredentialParams(url)
      if (loginResult) {
        breakdown.push(loginResult)
        threatTypes.add(ThreatType.Phishing)
      }

      const cryptoResult = this.checkCryptoWalletInPath(pathAndQuery)
      if (cryptoResult) {
        breakdown.push(cryptoResult)
        threatTypes.add(ThreatType.Scam)
      }

      const financialResult = this.checkFinancialKeywords(pathAndQuery)
      if (financialResult) {
        breakdown.push(financialResult)
        threatTypes.add(ThreatType.Scam)
      }

      const urgencyResult = this.checkUrgencyLanguage(pathAndQuery)
      if (urgencyResult) {
        breakdown.push(urgencyResult)
        threatTypes.add(ThreatType.Scam)
      }

      const prizeResult = this.checkPrizeLotteryPatterns(pathAndQuery)
      if (prizeResult) {
        breakdown.push(prizeResult)
        threatTypes.add(ThreatType.Scam)
      }

      const brandResult = this.checkBrandImpersonation(hostname, pathAndQuery)
      if (brandResult) {
        breakdown.push(brandResult)
        threatTypes.add(ThreatType.Phishing)
      }

      if (isAllowlisted && !known) {
        const knownMaliciousItem = breakdown.find((b) => b.category === 'Known malicious domain')
        if (!knownMaliciousItem && breakdown.length > 0) {
          for (let i = 0; i < breakdown.length; i++) {
            const b = breakdown[i]
            breakdown[i] = {
              ...b,
              score: Math.round(b.score * 0.85),
              maxScore: b.maxScore,
            }
          }
        }
      }
    } catch {
      breakdown.push({
        category: 'Invalid URL',
        score: 30,
        maxScore: 30,
        reason: 'The link is not a valid URL format.',
      })
      threatTypes.add(ThreatType.Suspicious)
    }

    const explanation = this.buildExplanation(breakdown, threatTypes)
    const recommendations = this.buildRecommendations(breakdown, threatTypes)

    return {
      breakdown,
      threatTypes: Array.from(threatTypes),
      explanation,
      recommendations,
    }
  }

  private checkKnownMaliciousDomain(hostname: string) {
    return this.scamDb.isDomainKnownMalicious(hostname)
  }

  private getBaseDomain(hostname: string): string {
    const parts = hostname.toLowerCase().split('.')
    if (parts.length <= 2) return hostname
    const tld = parts[parts.length - 1]
    const second = parts[parts.length - 2]
    if (tld === 'uk' || tld === 'au' || tld === 'jp') {
      if (parts.length >= 3) return parts.slice(-3).join('.')
    }
    return second + '.' + tld
  }

  private checkSuspiciousTld(url: URL): RiskBreakdownItem | null {
    const hostname = url.hostname
    const lastDot = hostname.lastIndexOf('.')
    if (lastDot === -1) return null
    const tld = hostname.slice(lastDot)
    if (!this.scamDb.isSuspiciousTld(tld)) return null
    return {
      category: 'Suspicious TLD',
      score: WEIGHTS.suspiciousTld,
      maxScore: WEIGHTS.suspiciousTld,
      reason: `Top-level domain "${tld}" is often used in phishing.`,
    }
  }

  private normalizeForComparison(str: string): string {
    let out = ''
    for (const char of str) {
      out += HOMOGLYPHS[char] ?? char
    }
    return out
  }

  private checkTyposquattingAndHomograph(hostname: string): RiskBreakdownItem | null {
    const normalized = this.normalizeForComparison(hostname)
    const domainOnly = normalized.replace(/^www\./, '').split('.')[0] ?? ''

    for (const brand of COMMON_BRANDS) {
      if (domainOnly.length < 4) continue
      if (domainOnly === brand) continue
      const lev = this.levenshtein(domainOnly, brand)
      const maxLen = Math.max(domainOnly.length, brand.length)
      if (maxLen > 0 && lev <= 2 && lev / maxLen < 0.4) {
        return {
          category: 'Possible typosquatting',
          score: WEIGHTS.typosquatting,
          maxScore: WEIGHTS.typosquatting,
          reason: `Domain "${domainOnly}" may imitate "${brand}".`,
        }
      }
    }

    const hasHomoglyph = Object.keys(HOMOGLYPHS).some((h) => hostname.includes(h))
    if (hasHomoglyph) {
      return {
        category: 'Homograph-style characters',
        score: WEIGHTS.typosquatting,
        maxScore: WEIGHTS.typosquatting,
        reason: 'URL contains characters that can look like Latin letters (homograph attack).',
      }
    }

    return null
  }

  private levenshtein(a: string, b: string): number {
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
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        )
      }
    }
    return dp[m][n]
  }

  private checkUrlShortener(hostname: string): RiskBreakdownItem | null {
    if (!KNOWN_SHORTENERS.has(hostname)) return null
    return {
      category: 'URL shortener',
      score: WEIGHTS.urlShortener,
      maxScore: WEIGHTS.urlShortener,
      reason: 'Link uses a URL shortening service; destination is hidden.',
    }
  }

  private checkEmailProviderLookalike(hostname: string): RiskBreakdownItem | null {
    const stem = hostname.replace(/^www\./, '').split('.')[0] ?? ''
    const stemLower = stem.toLowerCase()
    if (!EMAIL_LOOKALIKE_STEMS.has(stemLower)) return null
    return {
      category: 'Email provider lookalike',
      score: WEIGHTS.emailProviderLookalike,
      maxScore: WEIGHTS.emailProviderLookalike,
      reason: `Domain "${stem}" resembles a known email provider (e.g. Gmail, Outlook); often used in phishing.`,
    }
  }

  private checkIpAddress(hostname: string): RiskBreakdownItem | null {
    const ipv4 =
      /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/
    const ipv6 = /^\[?([0-9a-fA-F:]+)\]?$/
    if (ipv4.test(hostname) || ipv6.test(hostname.replace(/^\[|\]$/g, ''))) {
      return {
        category: 'IP address in URL',
        score: WEIGHTS.ipAddress,
        maxScore: WEIGHTS.ipAddress,
        reason: 'URL uses an IP address instead of a domain name; often used to evade detection.',
      }
    }
    return null
  }

  private checkExcessiveSubdomains(hostname: string): RiskBreakdownItem | null {
    const parts = hostname.split('.')
    if (parts.length < 4) return null
    return {
      category: 'Excessive subdomains',
      score: Math.min(WEIGHTS.excessiveSubdomains, parts.length * 3),
      maxScore: WEIGHTS.excessiveSubdomains,
      reason: `Many subdomains (${parts.length}); can be used to mimic legitimate sites.`,
    }
  }

  private checkEncodedCharacters(urlString: string): RiskBreakdownItem | null {
    const decoded = tryDecodeUri(urlString)
    const encodedCount = (urlString.match(/%[0-9A-Fa-f]{2}/g) ?? []).length
    if (encodedCount < 3) return null
    return {
      category: 'Encoded characters',
      score: Math.min(WEIGHTS.encodedChars, encodedCount * 2),
      maxScore: WEIGHTS.encodedChars,
      reason: `URL contains many encoded characters (${encodedCount}), which can hide the real destination.`,
    }
  }

  private checkLoginCredentialParams(url: URL): RiskBreakdownItem | null {
    const params = Array.from(url.searchParams.keys()).map((k) =>
      k.toLowerCase().replace(/[^a-z]/g, '')
    )
    const hit = params.some((p) => CREDENTIAL_PARAMS.has(p))
    if (!hit) return null
    return {
      category: 'Login/credential parameters',
      score: WEIGHTS.loginParams,
      maxScore: WEIGHTS.loginParams,
      reason: 'URL includes parameters commonly used on fake login pages.',
    }
  }

  private checkCryptoWalletInPath(pathAndQuery: string): RiskBreakdownItem | null {
    const btcMatch = pathAndQuery.match(/\b(1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34}|bc1[a-z0-9]{39,59})\b/)
    const ethMatch = pathAndQuery.match(/\b0x[a-fA-F0-9]{40}\b/)
    if (btcMatch || ethMatch) {
      return {
        category: 'Crypto wallet in URL',
        score: WEIGHTS.cryptoWallet,
        maxScore: WEIGHTS.cryptoWallet,
        reason: 'URL contains what looks like a Bitcoin or Ethereum address; common in scams.',
      }
    }
    return null
  }

  private checkFinancialKeywords(pathAndQuery: string): RiskBreakdownItem | null {
    const normalized = pathAndQuery.replace(/[^a-z0-9]/g, '')
    for (const kw of FINANCIAL_KEYWORDS) {
      if (normalized.includes(kw)) {
        return {
          category: 'Financial keywords',
          score: WEIGHTS.financialKeywords,
          maxScore: WEIGHTS.financialKeywords,
          reason: `URL contains financial/wire-transfer related wording ("${kw}").`,
        }
      }
    }
    return null
  }

  private checkUrgencyLanguage(pathAndQuery: string): RiskBreakdownItem | null {
    const normalized = pathAndQuery.replace(/[^a-z0-9]/g, '')
    for (const phrase of URGENCY_PHRASES) {
      if (normalized.includes(phrase)) {
        return {
          category: 'Urgency language',
          score: WEIGHTS.urgencyPhrases,
          maxScore: WEIGHTS.urgencyPhrases,
          reason: 'URL uses urgency-style language often seen in scams.',
        }
      }
    }
    return null
  }

  private checkPrizeLotteryPatterns(pathAndQuery: string): RiskBreakdownItem | null {
    const normalized = pathAndQuery.replace(/[^a-z0-9]/g, '')
    for (const phrase of PRIZE_PHRASES) {
      if (normalized.includes(phrase)) {
        return {
          category: 'Prize/lottery patterns',
          score: WEIGHTS.prizeLottery,
          maxScore: WEIGHTS.prizeLottery,
          reason: 'URL matches patterns commonly used in prize/lottery scams.',
        }
      }
    }
    return null
  }

  private checkBrandImpersonation(hostname: string, pathAndQuery: string): RiskBreakdownItem | null {
    const domainPart = hostname.replace(/^www\./, '').split('.')[0] ?? ''
    const combined = (domainPart + pathAndQuery).replace(/[^a-z0-9]/g, '')

    for (const brand of COMMON_BRANDS) {
      if (!combined.includes(brand)) continue
      if (domainPart === brand) continue
      const looksFake =
        domainPart.includes(brand) && domainPart.length > brand.length + 2
      if (looksFake) {
        return {
          category: 'Possible brand impersonation',
          score: WEIGHTS.brandImpersonation,
          maxScore: WEIGHTS.brandImpersonation,
          reason: `URL may be impersonating "${brand}".`,
        }
      }
    }
    return null
  }

  private buildExplanation(
    breakdown: RiskBreakdownItem[],
    threatTypes: Set<ThreatType>
  ): string {
    if (breakdown.length === 0) {
      return 'No issues identified.'
    }
    const parts = breakdown.map((b) => b.reason)
    const types = Array.from(threatTypes).join(', ')
    return `Detected: ${parts.join(' ')} Threat categories: ${types}.`
  }

  private buildRecommendations(
    breakdown: RiskBreakdownItem[],
    threatTypes: Set<ThreatType>
  ): string[] {
    const list: string[] = []
    if (threatTypes.has(ThreatType.Phishing)) {
      list.push('Do not enter passwords or personal data on this site.')
      list.push('Open the official site by typing the address yourself.')
    }
    if (threatTypes.has(ThreatType.Scam)) {
      list.push('Avoid sending money or crypto based on this link.')
      list.push('Verify the offer through official channels.')
    }
    if (threatTypes.has(ThreatType.Malware)) {
      list.push('Do not download files or run software from this link.')
    }
    if (threatTypes.has(ThreatType.Suspicious) || breakdown.length > 0) {
      list.push('Proceed with caution and verify the destination.')
    }
    if (list.length === 0) {
      list.push('No specific action required.')
    }
    return list
  }
}

function tryDecodeUri(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
