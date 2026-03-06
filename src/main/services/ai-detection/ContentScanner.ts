import type { ContentSource } from '../../../shared/ai-detection-types'
import type { AIDetectionResult } from '../../../shared/ai-detection-types'
import { AIContentDetector } from './AIContentDetector'
import { EmailDetector } from './detectors/EmailDetector'
import { MessageAppDetector } from './detectors/MessageAppDetector'
import { SocialMediaDetector } from './detectors/SocialMediaDetector'
import { DocumentDetector } from './detectors/DocumentDetector'
import { logger } from '../logger'

export interface ScanContentInput {
  text: string
  source?: ContentSource
  metadata?: Record<string, unknown>
  direction?: 'incoming' | 'outgoing'
}

/**
 * ContentScanner: scans text from any supported source, supports incoming/outgoing,
 * returns real-time AIDetectionResult with confidence and indicators.
 */
export class ContentScanner {
  private readonly genericDetector = new AIContentDetector()
  private readonly emailDetector = new EmailDetector()
  private readonly whatsappDetector = new MessageAppDetector('whatsapp')
  private readonly telegramDetector = new MessageAppDetector('telegram')
  private readonly discordDetector = new MessageAppDetector('discord')
  private readonly messagesDetector = new MessageAppDetector('messages')
  private readonly socialDetector = new SocialMediaDetector()
  private readonly documentDetector = new DocumentDetector()

  /**
   * Scan text and return AI detection result. Works for both incoming and outgoing.
   */
  scan(input: ScanContentInput): AIDetectionResult {
    const { text, source = 'generic', metadata = {}, direction } = input
    const trimmed = text.replace(/\s+/g, ' ').trim()
    const maxLength = 50_000
    const toAnalyze = trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed

    if (toAnalyze.length === 0) {
      return this.emptyResult(source)
    }

    try {
      const detector = this.getDetector(source)
      const result = detector.detect(toAnalyze, { ...metadata, direction })
      if (trimmed.length > maxLength) {
        result.analysisDetails.push(`Text was truncated to ${maxLength} characters for analysis`)
      }
      if (result.confidence >= 0.6 || (result.scamIndicators?.length ?? 0) > 0) {
        logger.debug('ContentScanner: AI or scam indicators', {
          source,
          confidence: result.confidence,
          scamCount: result.scamIndicators?.length ?? 0,
        })
      }
      return result
    } catch (err) {
      logger.error('ContentScanner: scan failed', source, err)
      return this.errorResult(toAnalyze.slice(0, 100), source, err)
    }
  }

  /**
   * Real-time style: scan and return quickly (same implementation, name for API clarity).
   */
  scanRealtime(input: ScanContentInput): AIDetectionResult {
    return this.scan(input)
  }

  private getDetector(
    source: ContentSource
  ): {
    detect: (text: string, metadata?: Record<string, unknown>) => AIDetectionResult
  } {
    switch (source) {
      case 'email':
        return this.emailDetector
      case 'whatsapp':
        return this.whatsappDetector
      case 'telegram':
        return this.telegramDetector
      case 'discord':
        return this.discordDetector
      case 'messages':
        return this.messagesDetector
      case 'social':
        return this.socialDetector
      case 'document':
        return this.documentDetector
      default:
        return this.genericDetector
    }
  }

  private emptyResult(source: ContentSource): AIDetectionResult {
    return {
      isAIgenerated: false,
      confidence: 0,
      indicators: [],
      analysisDetails: ['No text provided'],
      recommendation: 'Provide text content to analyze.',
      source,
      analyzedAt: Date.now(),
    }
  }

  private errorResult(
    textSample: string,
    source: ContentSource,
    err: unknown
  ): AIDetectionResult {
    const message = err instanceof Error ? err.message : String(err)
    return {
      isAIgenerated: false,
      confidence: 0,
      indicators: ['Analysis failed'],
      analysisDetails: [`Error: ${message}`],
      recommendation: 'Could not analyze content. Try again or use a shorter text.',
      source,
      analyzedAt: Date.now(),
    }
  }
}
