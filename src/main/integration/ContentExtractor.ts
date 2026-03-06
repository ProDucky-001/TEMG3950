import type { ExtractedContent, ContentSourceType, SupportedAppId } from '../../shared/integration-types'

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi

/**
 * Extracts and sanitizes content from supported applications. Never stores full message content.
 */
export class ContentExtractor {
  /**
   * Extract plain text and URLs from raw text. No persistence.
   */
  extractFromText(
    text: string,
    sourceType: ContentSourceType,
    appId: SupportedAppId
  ): ExtractedContent {
    const sanitized = this.sanitize(text)
    const urls = this.extractUrls(sanitized)
    const snippet = this.makeSnippet(sanitized, 500)
    return {
      text: sanitized,
      format: 'plain',
      sourceType,
      appId,
      urls,
      snippet,
    }
  }

  /**
   * Extract from HTML (e.g. email body). Strips tags and extracts links.
   */
  extractFromHtml(
    html: string,
    sourceType: ContentSourceType,
    appId: SupportedAppId
  ): ExtractedContent {
    const text = this.htmlToPlainText(html)
    return this.extractFromText(text, sourceType, appId)
  }

  /**
   * Sanitize: remove or redact sensitive patterns before analysis. Content is still not stored.
   */
  sanitize(text: string): string {
    let out = text
    out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email redacted]')
    out = out.replace(/\b(?:\+?1[-.]?)?\(?[0-9]{3}\)?[-.]?[0-9]{3}[-.]?[0-9]{4}\b/g, '[phone redacted]')
    out = out.replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, '[card redacted]')
    return out
  }

  extractUrls(text: string): string[] {
    const matches = text.match(URL_REGEX) ?? []
    return [...new Set(matches.map((u) => u.replace(/[.,;:!?)]+$/, '')))]
  }

  getSupportedFormats(): ('plain' | 'html' | 'markdown')[] {
    return ['plain', 'html', 'markdown']
  }

  private htmlToPlainText(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private makeSnippet(text: string, maxLen: number): string {
    const t = text.replace(/\s+/g, ' ').trim()
    if (t.length <= maxLen) return t
    return t.slice(0, maxLen) + '…'
  }
}
