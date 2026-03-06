import type { AIDetectionResult } from '../../../shared/ai-detection-types'
import { BaseSourceDetector } from './BaseSourceDetector'

export class MessageAppDetector extends BaseSourceDetector {
  private readonly appSource: 'whatsapp' | 'telegram' | 'discord' | 'messages' = 'whatsapp'

  constructor(app: 'whatsapp' | 'telegram' | 'discord' | 'messages' = 'whatsapp') {
    super()
    this.appSource = app
  }

  get source(): 'whatsapp' | 'telegram' | 'discord' | 'messages' {
    return this.appSource
  }

  protected override enrichResult(
    result: AIDetectionResult,
    text: string,
    metadata: Record<string, unknown>
  ): AIDetectionResult {
    const details = [...result.analysisDetails]

    if (text.length > 500 && !text.includes('?') && !/!\s*$/.test(text)) {
      details.push('Long message without questions or exclamation (unusual for chat)')
    }

    const linkCount = (text.match(/https?:\/\/[^\s]+/g) ?? []).length
    if (linkCount >= 2 && text.length < 400) {
      details.push('Multiple links in short message (common in scam forwards)')
    }

    if (/^(please|kindly|i need you to)\s+/im.test(text) && text.split(/\s+/).length > 30) {
      details.push('Formal request style in long message')
    }

    return {
      ...result,
      source: this.appSource,
      analysisDetails: details,
    }
  }
}
