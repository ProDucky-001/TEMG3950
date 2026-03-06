/**
 * AI-generated content detection types for ScamShield.
 */

export type ContentSource =
  | 'email'
  | 'whatsapp'
  | 'telegram'
  | 'discord'
  | 'messages'
  | 'social'
  | 'document'
  | 'generic'

export interface AIDetectionResult {
  /** Whether content is likely AI-generated */
  isAIgenerated: boolean
  /** Confidence in the detection (0.0–1.0) */
  confidence: number
  /** Human-readable reasons for the detection */
  indicators: string[]
  /** Technical analysis breakdown */
  analysisDetails: string[]
  /** User-facing recommendation */
  recommendation: string
  /** Source of the content (if known) */
  source?: ContentSource
  /** Scam/impersonation risk indicators found */
  scamIndicators?: string[]
  /** Timestamp of analysis */
  analyzedAt: number
}

export interface TextAnalysisMetrics {
  /** Entropy of token distribution (higher can indicate AI) */
  entropy: number
  /** Vocabulary complexity score */
  vocabularyComplexity: number
  /** Sentence length variance (low = more uniform, AI-like) */
  sentenceLengthVariance: number
  /** Average sentence length */
  avgSentenceLength: number
  /** Repetition score (high = repetitive) */
  repetitionScore: number
  /** Grammar/formality score (very high can indicate AI) */
  formalityScore: number
}

export interface ScamPatternMatch {
  type: 'impersonation' | 'urgency' | 'emotional_manipulation' | 'inconsistency'
  description: string
  confidence: number
}
