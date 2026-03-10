import type { WindowBounds } from '../../shared/background-types'

export interface OCRResult {
  fullText: string
  words: string[]
  lines: string[]
  confidence: number
  urls: string[]
}

/**
 * Full-width URL/navigation bar region helpers and URL extraction from OCR text.
 * Used when the capture is the top bar; region constants are app-specific.
 */
export class FullWidthOCRScanner {
  private readonly isMac = process.platform === 'darwin'

  /** Y offset of the top bar (from window top) per app. */
  getTopBarY(bounds: WindowBounds, appType: string): number {
    const offsets: Record<string, number> = {
      chrome: this.isMac ? 55 : 10,
      safari: this.isMac ? 25 : 10,
      edge: this.isMac ? 55 : 10,
      outlook: 80,
      default: 30,
    }
    return bounds.y + (offsets[appType.toLowerCase()] ?? offsets.default)
  }

  /** Height of the top/URL bar per app. */
  getTopBarHeight(appType: string): number {
    const heights: Record<string, number> = {
      chrome: 35,
      safari: 30,
      edge: 35,
      outlook: 45,
      default: 35,
    }
    return heights[appType.toLowerCase()] ?? heights.default
  }

  /**
   * Build full-width scan region (left to right of window) for the URL/navigation area.
   */
  getFullWidthScanRegion(windowBounds: WindowBounds, appType: string): {
    x: number
    y: number
    width: number
    height: number
  } {
    const y = this.getTopBarY(windowBounds, appType)
    const height = this.getTopBarHeight(appType)
    return {
      x: windowBounds.x + 10,
      y,
      width: Math.max(0, windowBounds.width - 20),
      height,
    }
  }

  /**
   * Extract URLs from OCR text (full http(s) URLs).
   */
  extractURLs(text: string): string[] {
    if (!text || typeof text !== 'string') return []
    const urlRegex = /https?:\/\/[^\s"'<>]+/gi
    const matches = text.match(urlRegex) ?? []
    return [...new Set(matches.map((u) => u.replace(/[.,;:)\]]+$/, '')))]
  }

  /**
   * Build OCRResult from existing OCR text (no capture/OCR here; capture is in renderer).
   */
  buildResultFromText(fullText: string, confidence: number = 0): OCRResult {
    const lines = fullText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    const words = fullText
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
    return {
      fullText,
      words,
      lines,
      confidence,
      urls: this.extractURLs(fullText),
    }
  }
}
