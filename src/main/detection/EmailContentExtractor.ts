import type { SupportedAppId } from '../../shared/integration-types'
import type { ContentSourceType, ExtractedContent } from '../../shared/integration-types'
import { ContentExtractor } from '../integration/ContentExtractor'
import { getContentSourceType } from '../integration/appMapping'
import type { ActiveWindowInfo } from './ActiveWindowInfo'
import { isEmailApplication } from './EmailPatterns'

/**
 * Maps email app name (from isEmailApplication) to SupportedAppId for content extraction.
 */
function emailAppNameToSupportedId(appName: string | null): SupportedAppId {
  if (!appName) return 'generic'
  const n = appName.toLowerCase()
  if (n.includes('gmail')) return 'gmail'
  if (n.includes('outlook') || n.includes('microsoft')) return 'outlook'
  if (n.includes('apple') || n.includes('mail')) return 'generic'
  return 'generic'
}

/**
 * Extracts content from email context: either from browser URL (webmail) or from OCR/text (desktop or body).
 */
export class EmailContentExtractor {
  private readonly contentExtractor = new ContentExtractor()

  /**
   * Extract content when we have active window info and optional OCR/text (e.g. from screen capture).
   * For webmail with URL, uses URL as primary context; for desktop or when text is provided, uses text.
   */
  extract(
    windowInfo: ActiveWindowInfo | null,
    ocrOrBodyText?: string
  ): { content: ExtractedContent; appId: SupportedAppId } | null {
    if (!windowInfo) return null
    const check = isEmailApplication(windowInfo)
    if (!check.isEmail || !check.appName) return null

    const appId = emailAppNameToSupportedId(check.appName)
    const sourceType: ContentSourceType = getContentSourceType(appId)

    if (check.url && check.appType === 'webmail') {
      const text = check.url + (ocrOrBodyText ? '\n' + ocrOrBodyText : '')
      const content = this.contentExtractor.extractFromText(text, sourceType, appId)
      return { content, appId }
    }

    if (ocrOrBodyText && ocrOrBodyText.length >= 20) {
      const content = this.contentExtractor.extractFromText(ocrOrBodyText, sourceType, appId)
      return { content, appId }
    }

    if (check.url) {
      const content = this.contentExtractor.extractFromText(check.url, sourceType, appId)
      return { content, appId }
    }

    return null
  }

  /**
   * Extract URLs from text (e.g. OCR result) for scanning.
   */
  extractUrls(text: string): string[] {
    return this.contentExtractor.extractUrls(text)
  }
}
