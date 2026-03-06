import type { AIDetectionResult } from '../../../shared/ai-detection-types'
import { BaseSourceDetector } from './BaseSourceDetector'

export class SocialMediaDetector extends BaseSourceDetector {
  readonly source = 'social' as const

  protected override enrichResult(
    result: AIDetectionResult,
    text: string,
    metadata: Record<string, unknown>
  ): AIDetectionResult {
    const indicators = [...result.indicators]
    const details = [...result.analysisDetails]

    const hashtagCount = (text.match(/#\w+/g) ?? []).length
    if (hashtagCount > 5 && text.length < 200) {
      details.push('High hashtag density for short post')
    }

    if (/@\w+(\s+@\w+)+/.test(text) && text.length > 150) {
      details.push('Multiple @mentions in longer text')
    }

    if (/^(thread|🧵)\s*[1-9]/im.test(text) && text.split(/\n/).length > 5) {
      details.push('Thread-style structure (can be human or AI)')
    }

    const emojiCount = (text.match(/[\u{1F300}-\u{1F9FF}]/gu) ?? []).length
    const wordCount = text.split(/\s+/).length
    if (wordCount > 50 && emojiCount === 0) {
      details.push('Long social post with no emojis and formal tone')
    }

    return {
      ...result,
      indicators: indicators.length > result.indicators.length ? indicators : result.indicators,
      analysisDetails: details,
    }
  }
}
