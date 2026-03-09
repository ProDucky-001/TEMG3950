import type { AppContextResult } from '../integration/AppContextDetector'
import type { SupportedAppId } from '../../shared/integration-types'
import { URLAreaOCR } from './URLAreaOCR'
import { FullWidthOCRScanner } from './FullWidthOCRScanner'

export interface EmailDetectionResult {
  isEmail: boolean
  appName: string | null
  appId: SupportedAppId | null
  /** URL parsed from URL-bar OCR (single best candidate). */
  detectedURL: string | null
  /** All URLs extracted from full OCR text. */
  urls: string[]
  /** Full OCR text (URL/navigation area). */
  fullText: string
  confidence: number
}

/**
 * Orchestrates email detection and URL extraction from OCR text.
 * Uses URL-area parsing and full-width URL extraction; capture/OCR is done elsewhere (renderer + OCRProcessor).
 */
export class EmailDetectionPipeline {
  private readonly urlAreaOCR = new URLAreaOCR()
  private readonly fullWidthScanner = new FullWidthOCRScanner()

  /**
   * Process context + OCR text (from URL bar / top of window) and return detection result with URLs.
   */
  processFromOCR(context: AppContextResult, ocrText: string, ocrConfidence: number = 0): EmailDetectionResult {
    const isEmail = context.isEmailClientActive
    const appId = context.appId
    const appName = appId ?? null

    if (!ocrText || ocrText.length < 10) {
      return {
        isEmail: !!isEmail,
        appName,
        appId,
        detectedURL: context.browserUrl && /^https?:\/\//i.test(context.browserUrl) ? context.browserUrl : null,
        urls: [],
        fullText: ocrText ?? '',
        confidence: ocrConfidence,
      }
    }

    const detectedURL =
      (context.browserUrl && /^https?:\/\//i.test(context.browserUrl.trim()) ? context.browserUrl.trim() : null) ??
      this.urlAreaOCR.parseURLFromText(ocrText) ??
      null

    const fullResult = this.fullWidthScanner.buildResultFromText(ocrText, ocrConfidence)
    const urls = fullResult.urls.length > 0 ? fullResult.urls : (detectedURL ? [detectedURL] : [])

    return {
      isEmail: !!isEmail,
      appName,
      appId,
      detectedURL,
      urls,
      fullText: fullResult.fullText,
      confidence: fullResult.confidence,
    }
  }
}
