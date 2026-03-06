import type { AIDetectionResult } from '../../../shared/ai-detection-types'
import { BaseSourceDetector } from './BaseSourceDetector'

export class DocumentDetector extends BaseSourceDetector {
  readonly source = 'document' as const

  protected override enrichResult(
    result: AIDetectionResult,
    text: string,
    _metadata: Record<string, unknown>
  ): AIDetectionResult {
    const details = [...result.analysisDetails]

    const paragraphCount = (text.match(/\n\s*\n/g) ?? []).length + 1
    const avgParagraphLength = text.split(/\n\s*\n/).reduce((acc, p) => acc + p.trim().length, 0) / Math.max(1, paragraphCount)
    if (paragraphCount >= 3 && avgParagraphLength > 200) {
      details.push('Structured document with long, uniform paragraphs')
    }

    if (/\b(section|subsection|figure|table)\s+[0-9]/i.test(text)) {
      details.push('Document-style numbering present')
    }

    if (text.length > 2000 && result.isAIgenerated) {
      details.push('Long document with AI-like patterns')
    }

    return {
      ...result,
      analysisDetails: details,
    }
  }
}
