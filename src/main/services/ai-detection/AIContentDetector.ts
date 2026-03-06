import { TextAnalysisEngine } from './TextAnalysisEngine'
import type {
  AIDetectionResult,
  ContentSource,
  TextAnalysisMetrics,
} from '../../../shared/ai-detection-types'
import type { ScamPatternMatch } from '../../../shared/ai-detection-types'

/** Phrases often overused in AI-generated text */
const AI_LIKE_PHRASES = new Set([
  'delve',
  'crucial',
  'testament',
  'landscape',
  'realm',
  'intricate',
  'foster',
  'moreover',
  'furthermore',
  'additionally',
  'it is important to note',
  'in conclusion',
  'in summary',
  'in today\'s',
  'navigate',
  'leverage',
  'streamline',
  'comprehensive',
  'robust',
  'facilitate',
  'utilize',
  'implement',
  'regarding',
  'with that said',
  'diving into',
  'when it comes to',
  'at the end of the day',
])

/** Impersonation / fake authority patterns */
const IMPERSONATION_PATTERNS = [
  { pattern: /(customer support|support team|help desk|service team)\s+(here|contacting you)/i, desc: 'Fake customer support tone' },
  { pattern: /(ceo|cto|cfo|executive)\s+(requesting|asking|urgent)/i, desc: 'Executive/CEO fraud language' },
  { pattern: /(verify your identity|confirm your account|validate your information)/i, desc: 'Identity verification pressure' },
  { pattern: /(dear (customer|valued customer|account holder))/i, desc: 'Generic formal greeting' },
  { pattern: /(kindly|please kindly|i would like you to)/i, desc: 'Overly polite request style' },
]

/** Urgency and pressure tactics */
const URGENCY_PATTERNS = [
  { pattern: /(act now|immediately|urgent|asap|within (24|48) hours)/i, desc: 'Time pressure' },
  { pattern: /(limited time|offer expires|don\'t miss out|last chance)/i, desc: 'Scarcity language' },
  { pattern: /(suspend|lock|close your account)/i, desc: 'Account threat' },
  { pattern: /(wire transfer|send (funds|money) (now|immediately))/i, desc: 'Financial urgency' },
]

/** Emotional manipulation */
const EMOTIONAL_PATTERNS = [
  { pattern: /(congratulations|you have been selected|you have won)/i, desc: 'Prize/good news hook' },
  { pattern: /(trust me|believe me|i promise)/i, desc: 'Trust assertion' },
  { pattern: /(family|emergency|sick|hospital|stranded)/i, desc: 'Emotional emergency' },
  { pattern: /(only you can|you are the only one|special offer for you)/i, desc: 'Exclusivity flattery' },
]

export class AIContentDetector {
  private readonly textEngine = new TextAnalysisEngine()

  /**
   * Run full AI and scam-pattern detection on text.
   */
  detect(
    text: string,
    source?: ContentSource
  ): AIDetectionResult {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (normalized.length < 10) {
      return this.shortContentResult(normalized, source)
    }

    const metrics = this.textEngine.analyze(normalized)
    const factual = this.textEngine.analyzeFactualClaims(normalized)

    const indicators: string[] = []
    const analysisDetails: string[] = []
    const scamIndicators: string[] = []
    let aiScore = 0
    const reasons: string[] = []

    this.applyMetricSignals(metrics, indicators, analysisDetails, reasons, (s) => {
      aiScore += s
    })
    this.applyAIPhraseCheck(normalized, indicators, analysisDetails, reasons, (s) => {
      aiScore += s
    })
    this.applyRepetitionAndFlow(metrics, indicators, analysisDetails, reasons, (s) => {
      aiScore += s
    })
    this.applyPerfectGrammarSignal(metrics, normalized, indicators, analysisDetails, (s) => {
      aiScore += s
    })

    for (const i of factual.indicators) {
      indicators.push(i)
      scamIndicators.push(i)
    }
    for (const d of factual.details) {
      analysisDetails.push(d)
    }

    const scamMatches = this.detectScamPatterns(normalized)
    for (const m of scamMatches) {
      scamIndicators.push(m.description)
      analysisDetails.push(`${m.type}: ${m.description} (confidence ${m.confidence.toFixed(2)})`)
    }

    const confidence = this.normalizeConfidence(aiScore, indicators.length, scamIndicators.length)
    const isAI = confidence >= 0.5
    const recommendation = this.buildRecommendation(isAI, confidence, scamIndicators)

    return {
      isAIgenerated: isAI,
      confidence,
      indicators: [...new Set(indicators)].slice(0, 15),
      analysisDetails: [...new Set(analysisDetails)].slice(0, 20),
      recommendation,
      source: source ?? 'generic',
      scamIndicators: scamIndicators.length > 0 ? scamIndicators : undefined,
      analyzedAt: Date.now(),
    }
  }

  private applyMetricSignals(
    m: TextAnalysisMetrics,
    indicators: string[],
    details: string[],
    reasons: string[],
    addScore: (s: number) => void
  ): void {
    if (m.sentenceLengthVariance < 3 && m.avgSentenceLength >= 12) {
      indicators.push('Very uniform sentence length (common in AI text)')
      details.push(`Sentence length variance: ${m.sentenceLengthVariance.toFixed(2)}`)
      reasons.push('uniform_sentences')
      addScore(0.15)
    }
    if (m.vocabularyComplexity > 0.75 && m.entropy > 4) {
      indicators.push('High vocabulary diversity and entropy')
      details.push(`Vocabulary complexity: ${m.vocabularyComplexity.toFixed(2)}, entropy: ${m.entropy.toFixed(2)}`)
      reasons.push('vocabulary_entropy')
      addScore(0.1)
    }
    if (m.formalityScore > 0.5) {
      indicators.push('Formal, polished language')
      details.push(`Formality score: ${m.formalityScore.toFixed(2)}`)
      reasons.push('formality')
      addScore(0.12)
    }
    if (m.repetitionScore > 0.4) {
      indicators.push('Repetitive phrasing')
      details.push(`Repetition score: ${m.repetitionScore.toFixed(2)}`)
      reasons.push('repetition')
      addScore(0.08)
    }
  }

  private applyAIPhraseCheck(
    text: string,
    indicators: string[],
    details: string[],
    reasons: string[],
    addScore: (s: number) => void
  ): void {
    const lower = text.toLowerCase()
    const tokens = lower.split(/\s+/).map((t) => t.replace(/[^\w]/g, ''))
    let hits = 0
    for (const token of tokens) {
      if (AI_LIKE_PHRASES.has(token)) hits++
    }
    const phraseHits = Array.from(AI_LIKE_PHRASES).filter((p) => lower.includes(p)).length
    const totalSignals = phraseHits + Math.min(5, hits)
    if (totalSignals >= 2) {
      indicators.push('AI-associated phrases detected')
      details.push(`AI-like phrase matches: ${totalSignals}`)
      reasons.push('ai_phrases')
      addScore(Math.min(0.25, totalSignals * 0.06))
    }
  }

  private applyRepetitionAndFlow(
    m: TextAnalysisMetrics,
    indicators: string[],
    details: string[],
    reasons: string[],
    addScore: (s: number) => void
  ): void {
    if (m.repetitionScore >= 0.5 && m.sentenceLengthVariance < 4) {
      indicators.push('Repetitive structure with uniform flow')
      details.push('Repetition and low sentence variation suggest templated or generated text')
      reasons.push('repetition_flow')
      addScore(0.1)
    }
  }

  private applyPerfectGrammarSignal(
    m: TextAnalysisMetrics,
    text: string,
    indicators: string[],
    details: string[],
    addScore: (s: number) => void
  ): void {
    const typoLike = (text.match(/\b(aplication|recieve|occured|teh|adn|taht|waht|becuase)\b/gi) ?? []).length
    const hasPunctuation = /[.!?]/.test(text)
    const longEnough = text.split(/\s+/).length >= 20
    if (longEnough && hasPunctuation && typoLike === 0 && m.formalityScore > 0.3) {
      indicators.push('Unusually polished grammar for casual context')
      details.push('No common typos; consistent punctuation and formal tone')
      addScore(0.08)
    }
  }

  private detectScamPatterns(text: string): ScamPatternMatch[] {
    const matches: ScamPatternMatch[] = []
    for (const { pattern, desc } of IMPERSONATION_PATTERNS) {
      if (pattern.test(text)) {
        matches.push({ type: 'impersonation', description: desc, confidence: 0.6 })
      }
    }
    for (const { pattern, desc } of URGENCY_PATTERNS) {
      if (pattern.test(text)) {
        matches.push({ type: 'urgency', description: desc, confidence: 0.65 })
      }
    }
    for (const { pattern, desc } of EMOTIONAL_PATTERNS) {
      if (pattern.test(text)) {
        matches.push({ type: 'emotional_manipulation', description: desc, confidence: 0.55 })
      }
    }
    return matches
  }

  private normalizeConfidence(
    aiScore: number,
    indicatorCount: number,
    scamCount: number
  ): number {
    let c = Math.min(1, aiScore * 1.2 + indicatorCount * 0.03)
    if (scamCount > 0) c = Math.min(1, c + 0.15 * scamCount)
    return Math.round(c * 100) / 100
  }

  private buildRecommendation(
    isAI: boolean,
    confidence: number,
    scamIndicators: string[]
  ): string {
    if (scamIndicators.length > 0) {
      return 'This message contains patterns commonly used in scams or impersonation. Do not send money or personal details. Verify the sender through official channels.'
    }
    if (isAI && confidence >= 0.7) {
      return 'Content appears likely to be AI-generated. Consider verifying the source and intent before trusting or sharing.'
    }
    if (isAI && confidence >= 0.5) {
      return 'Some indicators suggest AI-generated content. Proceed with normal caution.'
    }
    return 'No strong AI or scam indicators. Standard vigilance recommended.'
  }

  private shortContentResult(text: string, source?: ContentSource): AIDetectionResult {
    return {
      isAIgenerated: false,
      confidence: 0,
      indicators: [],
      analysisDetails: ['Content too short for reliable AI detection'],
      recommendation: 'Not enough text to analyze. AI detection works best with longer messages.',
      source: source ?? 'generic',
      analyzedAt: Date.now(),
    }
  }
}
