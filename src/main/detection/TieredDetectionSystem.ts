import type { AppContextResult } from '../integration/AppContextDetector'
import type { WindowInfo, Tier1Result, Tier2Result, Tier3Result } from './types'
import { URLAreaOCR } from './URLAreaOCR'
import { FullWidthOCRScanner } from './FullWidthOCRScanner'
import type { OCRProcessor } from '../services/OCRProcessor'
import type { ApplicationIntegrator } from '../integration/ApplicationIntegrator'
import type { ContentExtractor } from '../integration/ContentExtractor'
import { getContentSourceType } from '../integration/appMapping'
import type { ExtractedContent, ContentContext, SupportedAppId } from '../../shared/integration-types'

/**
 * Multi-tier detection: Tier 1 (quick pattern) → Tier 2 (URL bar OCR) → Tier 3 (full analysis).
 * Minimizes latency by only running heavier work when needed.
 */
export class TieredDetectionSystem {
  private readonly urlAreaOCR = new URLAreaOCR()
  private readonly fullWidthScanner = new FullWidthOCRScanner()

  constructor(
    private readonly ocr: OCRProcessor,
    private readonly extractor: ContentExtractor,
    private readonly analyzer: ApplicationIntegrator
  ) {}

  /**
   * Tier 1: Ultra-fast (<10ms target). Pattern match only (process name, browser URL); no OCR.
   */
  async tier1QuickCheck(context: AppContextResult): Promise<Tier1Result> {
    const start = performance.now()
    const isEmail = context.isEmailClientActive
    const appType = context.appId ?? 'unknown'
    const confidence = isEmail ? 0.7 : 0
    return {
      isEmail,
      appType,
      detectionTime: performance.now() - start,
      confidence,
    }
  }

  /**
   * Tier 2: Fast (<500ms target). OCR URL bar image and parse URL. Call when capture buffer is available.
   */
  async tier2URLCheck(_windowInfo: WindowInfo, imageBuffer: Buffer | Uint8Array | ArrayBuffer): Promise<Tier2Result> {
    const start = performance.now()
    const text = await this.ocr.recognize(imageBuffer)
    const url = this.urlAreaOCR.parseURLFromText(text ?? '')
    const confidence = url ? 0.85 : (text && text.length > 5 ? 0.5 : 0)
    return {
      url: url ?? null,
      confidence,
      detectionTime: performance.now() - start,
    }
  }

  /**
   * Tier 3: Full analysis (<2s target). Build OCR result, extract content, run threat analysis.
   */
  async tier3FullAnalysis(
    context: AppContextResult,
    ocrText: string,
    appId: string
  ): Promise<Tier3Result> {
    const start = performance.now()
    const fullResult = this.fullWidthScanner.buildResultFromText(ocrText, 0)
    const sourceType = getContentSourceType(appId as SupportedAppId)
    const content: ExtractedContent = this.extractor.extractFromText(
      ocrText,
      sourceType === 'email' ? 'email' : 'clipboard',
      appId as SupportedAppId
    )
    const ctx: ContentContext =
      sourceType === 'email'
        ? { type: 'email', email: {} }
        : { type: 'browser', browser: { url: context.browserUrl ?? undefined } }
    const analysis = await this.analyzer.analyzeContent(content, ctx)
    return {
      fullText: fullResult.fullText,
      urls: fullResult.urls,
      threatDetected: analysis.threatDetected,
      riskScore: analysis.riskScore ?? 0,
      reasons: analysis.reasons ?? [],
      detectionTime: performance.now() - start,
    }
  }
}
