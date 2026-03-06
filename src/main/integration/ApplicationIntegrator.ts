import type {
  ExtractedContent,
  ContentContext,
  IntegrationAnalysisResult,
  EmailContentContext,
  MessageContentContext,
  BrowserContentContext,
} from '../../shared/integration-types'
import type { LinkScanner } from '../services/LinkScanner'
import type { ContentScanner } from '../services/ai-detection/ContentScanner'
import { logger } from '../services/logger'

/**
 * Integrates with email, messaging, and browser content: analyzes for suspicious links,
 * spoofing, urgency, forward chains, and phishing patterns.
 */
export class ApplicationIntegrator {
  constructor(
    private readonly linkScanner: LinkScanner,
    private readonly contentScanner: ContentScanner
  ) {}

  /**
   * Analyze extracted content with optional context. Returns threat summary; never stores content.
   */
  async analyzeContent(
    content: ExtractedContent,
    context?: ContentContext
  ): Promise<IntegrationAnalysisResult> {
    const reasons: string[] = []
    let maxRisk = 0
    const linkResults: Array<{ url: string; riskScore: number }> = []

    if (context?.type === 'email') {
      const emailReasons = this.analyzeEmailContext(context.email)
      reasons.push(...emailReasons)
    }
    if (context?.type === 'messaging') {
      const msgReasons = this.analyzeMessageContext(context.message)
      reasons.push(...msgReasons)
    }
    if (context?.type === 'browser') {
      const browserReasons = this.analyzeBrowserContext(context.browser)
      reasons.push(...browserReasons)
    }

    for (const url of content.urls) {
      try {
        const result = await this.linkScanner.scan(url)
        linkResults.push({ url: result.url, riskScore: result.riskScore })
        if (result.riskScore > maxRisk) maxRisk = result.riskScore
        if (result.riskScore >= 50) {
          reasons.push(`Suspicious link: ${result.explanation}`)
        }
      } catch (err) {
        logger.debug('ApplicationIntegrator: link scan failed', url, err)
      }
    }

    if (content.snippet && content.snippet.length > 50) {
      const aiResult = this.contentScanner.scan({
        text: content.snippet,
        source: content.sourceType === 'email' ? 'email' : content.sourceType === 'messaging' ? 'whatsapp' : 'generic',
      })
      if (aiResult.scamIndicators?.length) {
        reasons.push(...aiResult.scamIndicators)
        if (aiResult.confidence >= 0.6) maxRisk = Math.max(maxRisk, 40)
      }
    }

    const threatDetected = maxRisk >= 50 || reasons.some((r) => r.toLowerCase().includes('suspicious') || r.toLowerCase().includes('phish'))
    const recommendation = threatDetected
      ? 'Do not click links or share personal information. Verify the sender through official channels.'
      : 'No high-risk indicators. Stay cautious with links and requests.'

    return {
      threatDetected,
      riskScore: maxRisk,
      reasons: [...new Set(reasons)].slice(0, 20),
      linkResults: linkResults.length ? linkResults : undefined,
      recommendation,
    }
  }

  private analyzeEmailContext(ctx?: EmailContentContext): string[] {
    const reasons: string[] = []
    if (!ctx) return reasons

    if (ctx.from && ctx.replyTo) {
      const fromAddr = this.extractEmail(ctx.from)
      const replyAddr = this.extractEmail(ctx.replyTo)
      if (fromAddr && replyAddr && fromAddr.toLowerCase() !== replyAddr.toLowerCase()) {
        reasons.push('Reply-To differs from From (possible spoofing)')
      }
    }

    if (ctx.fromHeader && ctx.from) {
      const displayName = ctx.fromHeader.replace(/<[^>]+>/, '').trim()
      if (displayName.length > 0 && !ctx.from.includes(displayName) && /^[A-Za-z ]+$/.test(displayName)) {
        const addr = this.extractEmail(ctx.from)
        if (addr && !displayName.includes(addr)) {
          reasons.push('Display name may not match sender address')
        }
      }
    }

    const subject = (ctx.subject ?? '').toLowerCase()
    const urgencyMarkers = ['urgent', 'action required', 'verify your account', 'suspended', 'immediately', 'asap']
    if (urgencyMarkers.some((m) => subject.includes(m))) {
      reasons.push('Subject line contains urgency language')
    }

    return reasons
  }

  private analyzeMessageContext(ctx?: MessageContentContext): string[] {
    const reasons: string[] = []
    if (!ctx) return reasons

    if (ctx.isForward) {
      reasons.push('Message appears to be a forward')
    }
    if (ctx.forwardDepth && ctx.forwardDepth > 2) {
      reasons.push(`Long forward chain (depth ${ctx.forwardDepth}); common in scam distribution`)
    }
    if (ctx.hasMedia) {
      reasons.push('Message includes media (captions can contain scam links)')
    }
    return reasons
  }

  private analyzeBrowserContext(ctx?: BrowserContentContext): string[] {
    const reasons: string[] = []
    if (!ctx?.url) return reasons

    const url = ctx.url.toLowerCase()
    if (url.includes('login') || url.includes('signin') || url.includes('account')) {
      reasons.push('URL suggests login/account page; verify domain')
    }
    if (url.includes('secure') && !url.startsWith('https://')) {
      reasons.push('Page claims "secure" but not using HTTPS')
    }
    const title = (ctx.title ?? '').toLowerCase()
    if (title.includes('verify') || title.includes('suspended') || title.includes('confirm')) {
      reasons.push('Page title uses common phishing wording')
    }
    return reasons
  }

  private extractEmail(s: string): string | null {
    const match = s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
    return match ? match[0] : null
  }
}
