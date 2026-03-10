import type { WindowBounds } from '../../shared/background-types'

export interface URLBarRegion {
  x: number
  y: number
  width: number
  height: number
}

/**
 * URL/address bar region definitions per app and URL parsing from OCR text.
 * Capture is done in the renderer (single URL-bar band); this module provides
 * region constants for consistency and URL extraction from OCR output.
 */
export class URLAreaOCR {
  private readonly isMac = process.platform === 'darwin'

  /**
   * Get the URL bar region in screen coordinates for a given app type.
   * Used for documentation and for any future app-specific capture.
   */
  getURLBarRegion(windowBounds: WindowBounds, appType: string): URLBarRegion {
    const type = appType.toLowerCase()
    const regions: Record<string, URLBarRegion> = {
      safari: {
        x: windowBounds.x + 80,
        y: windowBounds.y + (this.isMac ? 25 : 10),
        width: windowBounds.width - 160,
        height: this.isMac ? 30 : 35,
      },
      chrome: {
        x: windowBounds.x + 70,
        y: windowBounds.y + (this.isMac ? 55 : 10),
        width: windowBounds.width - 140,
        height: 35,
      },
      edge: {
        x: windowBounds.x + 70,
        y: windowBounds.y + (this.isMac ? 55 : 10),
        width: windowBounds.width - 140,
        height: 35,
      },
      outlook: {
        x: windowBounds.x + 10,
        y: windowBounds.y + 80,
        width: windowBounds.width - 20,
        height: 40,
      },
      default: {
        x: windowBounds.x + 50,
        y: windowBounds.y + 30,
        width: windowBounds.width - 100,
        height: 35,
      },
    }
    return regions[type] ?? regions.default
  }

  /**
   * Parse a URL from OCR text (handles common artifacts and partial URLs).
   */
  parseURLFromText(text: string): string | undefined {
    const cleaned = text.trim().replace(/\s+/g, ' ')
    if (!cleaned) return undefined
    // With scheme
    const withScheme = /https?:\/\/[^\s"'<>]+/i
    const m1 = cleaned.match(withScheme)
    if (m1) return m1[0].replace(/[.,;:)\]]+$/, '')
    // Domain-like (no scheme) - allow subdomains (dots in the label part)
    const domainLike = /[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}(?:\/[^\s"'<>]*)?/i
    const m2 = cleaned.match(domainLike)
    if (m2) return m2[0].replace(/[.,;:)\]]+$/, '')
    return undefined
  }
}
