import type { ContentSource } from '../../../shared/ai-detection-types'
import { AIContentDetector } from '../AIContentDetector'
import type { AIDetectionResult } from '../../../shared/ai-detection-types'

export interface SourceDetector {
  readonly source: ContentSource
  detect(text: string, metadata?: Record<string, unknown>): AIDetectionResult
}

export abstract class BaseSourceDetector implements SourceDetector {
  protected readonly detector = new AIContentDetector()

  abstract readonly source: ContentSource

  detect(text: string, metadata?: Record<string, unknown>): AIDetectionResult {
    const result = this.detector.detect(text, this.source)
    return this.enrichResult(result, text, metadata ?? {})
  }

  protected enrichResult(
    result: AIDetectionResult,
    _text: string,
    _metadata: Record<string, unknown>
  ): AIDetectionResult {
    return result
  }
}
