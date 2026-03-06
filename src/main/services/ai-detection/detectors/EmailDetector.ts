import type { AIDetectionResult } from '../../../shared/ai-detection-types'
import { BaseSourceDetector } from './BaseSourceDetector'

export class EmailDetector extends BaseSourceDetector {
  readonly source = 'email' as const

  protected override enrichResult(
    result: AIDetectionResult,
    text: string,
    metadata: Record<string, unknown>
  ): AIDetectionResult {
    const indicators = [...result.indicators]
    const details = [...result.analysisDetails]

    const hasSubject = typeof metadata.subject === 'string' && metadata.subject.length > 0
    if (hasSubject) {
      const subject = String(metadata.subject)
      if (/^(re:\s*){2,}/i.test(subject) || /fwd:\s*fwd:/i.test(subject)) {
        details.push('Unusual reply/forward chain in subject')
      }
      if (/urgent|action required|verify (your )?account/i.test(subject) && text.length > 200) {
        indicators.push('Urgent or verification subject line with long body')
      }
    }

    const greeting = text.slice(0, 80).toLowerCase()
    if (/dear (sir|madam|customer|valued customer|account holder)/i.test(greeting)) {
      details.push('Generic formal email greeting')
    }
    if (/^(hi|hello)\s*[,.]?\s*$/m.test(text) && text.length > 300) {
      details.push('Short greeting with long formal body (mixed style)')
    }

    const hasSignature = /(sincerely|regards|best regards|kind regards|thanks,)\s*$/im.test(text)
    if (hasSignature) {
      details.push('Email contains formal sign-off')
    }

    return {
      ...result,
      indicators: indicators.length > result.indicators.length ? indicators : result.indicators,
      analysisDetails: details.length > result.analysisDetails.length ? details : result.analysisDetails,
    }
  }
}
