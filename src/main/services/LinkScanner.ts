import type { ScamDatabase } from './ScamDatabase'
import { LinkAnalyzer } from './LinkAnalyzer'
import { logger } from './logger'
import { writeLinkScanDebugLog, type LinkScanDebugContext } from './linkScannerDebugLog'
import {
  LinkDetectionResult,
  ThreatType,
  type RiskBreakdownItem,
} from '../../shared/link-detection-types'

const MAX_RISK_SUM = 100

export type LinkScanOptions = {
  debugContext?: LinkScanDebugContext
  /** When true, skip HTTP redirect resolution for shortener URLs (faster; shorteners still get risk score). */
  skipShortenerExpansion?: boolean
}

export class LinkScanner {
  private readonly analyzer: LinkAnalyzer

  constructor(private readonly scamDb: ScamDatabase) {
    this.analyzer = new LinkAnalyzer(scamDb)
  }

  /**
   * Analyze a URL asynchronously and return a full detection result.
   * Optional debugContext (isEmail, source) is written to the link-scanner debug log.
   */
  async scan(url: string, options?: LinkScanOptions): Promise<LinkDetectionResult> {
    const debugContext = options?.debugContext
    const skipShortenerExpansion = options?.skipShortenerExpansion === true
    const normalized = this.normalizeInput(url)
    if (!normalized) {
      logger.warn('LinkScanner: invalid URL input', url)
      const result = this.invalidUrlResult(url)
      writeLinkScanDebugLog(result, debugContext)
      return result
    }

    try {
      const expanded = skipShortenerExpansion
        ? normalized
        : await this.expandIfShortener(normalized)
      const { breakdown, threatTypes, explanation, recommendations } =
        this.analyzer.analyze(expanded)

      const riskScore = this.computeRiskScore(breakdown)
      const confidence = this.computeConfidence(breakdown, threatTypes)

      if (riskScore >= 50) {
        this.scamDb.addRecentDetection({
          url: expanded,
          riskScore,
          threatTypes,
        })
      }

      const result: LinkDetectionResult = {
        url: normalized,
        resolvedUrl: expanded !== normalized ? expanded : undefined,
        riskScore,
        threatTypes,
        explanation,
        recommendations,
        confidence,
        riskBreakdown: breakdown,
        analyzedAt: Date.now(),
      }
      writeLinkScanDebugLog(result, debugContext)
      return result
    } catch (err) {
      logger.error('LinkScanner: analysis failed', normalized, err)
      const result = this.errorResult(normalized, err)
      writeLinkScanDebugLog(result, debugContext)
      return result
    }
  }

  /**
   * Scan multiple URLs. Returns results in the same order as input.
   * Optional debugContext is applied to each scan and written to the debug log.
   */
  async scanMany(urls: string[], options?: LinkScanOptions): Promise<LinkDetectionResult[]> {
    return Promise.all(urls.map((u) => this.scan(u, options)))
  }

  private normalizeInput(input: string): string | null {
    const trimmed = input.trim()
    if (!trimmed) return null
    try {
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
        return new URL(trimmed, 'https://example.com').href
      }
      new URL(trimmed)
      return trimmed
    } catch {
      return null
    }
  }

  private computeRiskScore(breakdown: RiskBreakdownItem[]): number {
    if (breakdown.length === 0) return 0
    const sum = breakdown.reduce((acc, b) => acc + b.score, 0)
    return Math.min(100, Math.round(sum))
  }

  private computeConfidence(
    breakdown: RiskBreakdownItem[],
    threatTypes: ThreatType[]
  ): number {
    if (breakdown.length === 0) return 0.5
    const avgScore =
      breakdown.reduce((acc, b) => acc + b.score / b.maxScore, 0) /
      breakdown.length
    const typeConfidence = Math.min(1, threatTypes.length * 0.2 + 0.3)
    return Math.min(1, (avgScore + typeConfidence) / 2)
  }

  private async expandIfShortener(url: string): Promise<string> {
    try {
      const u = new URL(url)
      const hostname = u.hostname.toLowerCase()
      const shorteners = new Set([
        'bit.ly',
        'tinyurl.com',
        't.co',
        'goo.gl',
        'ow.ly',
        'is.gd',
        'cutt.ly',
      ])
      if (!shorteners.has(hostname)) return url

      const { net } = require('electron')
      return new Promise((resolve) => {
        let lastUrl = url
        const request = net.request(url)
        request.on('redirect', (_statusCode: number, redirectUrl: string) => {
          lastUrl = redirectUrl
        })
        request.on('response', () => {
          resolve(lastUrl)
        })
        request.on('error', () => resolve(url))
        request.end()
      })
    } catch {
      return url
    }
  }

  private invalidUrlResult(original: string): LinkDetectionResult {
    return {
      url: original,
      riskScore: 30,
      threatTypes: [ThreatType.Suspicious],
      explanation: 'The provided text is not a valid URL.',
      recommendations: ['Do not click; verify the link from a trusted source.'],
      confidence: 0.8,
      riskBreakdown: [
        {
          category: 'Invalid URL',
          score: 30,
          maxScore: 100,
          reason: 'Input is not a valid URL.',
        },
      ],
      analyzedAt: Date.now(),
    }
  }

  private errorResult(url: string, err: unknown): LinkDetectionResult {
    const message = err instanceof Error ? err.message : String(err)
    return {
      url,
      riskScore: 50,
      threatTypes: [ThreatType.Suspicious],
      explanation: `Analysis failed: ${message}. Treat link with caution.`,
      recommendations: [
        'Unable to fully analyze this link.',
        'Avoid entering sensitive data or downloading files.',
      ],
      confidence: 0.3,
      riskBreakdown: [
        {
          category: 'Analysis error',
          score: 50,
          maxScore: 100,
          reason: message,
        },
      ],
      analyzedAt: Date.now(),
    }
  }
}
