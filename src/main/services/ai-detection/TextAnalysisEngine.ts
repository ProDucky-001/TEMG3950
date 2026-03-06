import type { TextAnalysisMetrics } from '../../../shared/ai-detection-types'

/**
 * Tokenize text into words (simple whitespace + punctuation split).
 */
function tokenize(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return []
  return normalized
    .split(/\s+/)
    .map((w) => w.replace(/^[^\w]+|[^\w]+$/g, ''))
    .filter((w) => w.length > 0)
}

/**
 * Split text into sentences (simple period/exclamation/question split).
 */
function sentenceSplit(text: string): string[] {
  const normalized = text.replace(/\r\n|\n/g, ' ').trim()
  if (!normalized) return []
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Shannon entropy of a distribution (tokens or characters).
 */
function entropy(counts: Map<string, number>, total: number): number {
  if (total <= 0) return 0
  let h = 0
  for (const n of counts.values()) {
    if (n <= 0) continue
    const p = n / total
    h -= p * Math.log2(p)
  }
  return h
}

/**
 * Text analysis engine: token distribution, entropy, vocabulary,
 * sentence length variation, and style metrics.
 */
export class TextAnalysisEngine {
  analyze(text: string): TextAnalysisMetrics {
    const tokens = tokenize(text)
    const sentences = sentenceSplit(text)
    const totalTokens = tokens.length
    const totalChars = text.replace(/\s/g, '').length

    const tokenCounts = new Map<string, number>()
    for (const t of tokens) {
      tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 1)
    }

    const tokenEntropy = entropy(tokenCounts, totalTokens)

    const charCounts = new Map<string, number>()
    for (const c of text.replace(/\s/g, '').toLowerCase()) {
      charCounts.set(c, (charCounts.get(c) ?? 0) + 1)
    }
    const charEntropy = entropy(charCounts, totalChars)

    const uniqueTokens = tokenCounts.size
    const vocabularyComplexity =
      totalTokens > 0 ? uniqueTokens / Math.min(totalTokens, 500) : 0

    const sentenceLengths = sentences.map((s) => tokenize(s).length).filter((n) => n > 0)
    const avgSentenceLength =
      sentenceLengths.length > 0
        ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
        : 0
    const variance =
      sentenceLengths.length > 1
        ? sentenceLengths.reduce(
            (acc, len) => acc + (len - avgSentenceLength) ** 2,
            0
          ) / (sentenceLengths.length - 1)
        : 0
    const sentenceLengthVariance = Math.sqrt(variance)

    const repetitionScore = this.computeRepetitionScore(tokens, tokenCounts)

    const formalityScore = this.computeFormalityScore(text, tokens)

    return {
      entropy: (tokenEntropy + charEntropy) / 2,
      vocabularyComplexity: Math.min(1, vocabularyComplexity),
      sentenceLengthVariance,
      avgSentenceLength,
      repetitionScore,
      formalityScore,
    }
  }

  private computeRepetitionScore(
    tokens: string[],
    tokenCounts: Map<string, number>
  ): number {
    if (tokens.length < 3) return 0
    const unique = tokenCounts.size
    const total = tokens.length
    const repeatRatio = 1 - unique / total
    const bigrams = new Map<string, number>()
    for (let i = 0; i < tokens.length - 1; i++) {
      const bg = `${tokens[i]} ${tokens[i + 1]}`
      bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1)
    }
    const repeatedBigrams = Array.from(bigrams.values()).filter((c) => c > 1).length
    const bigramRepeat = bigrams.size > 0 ? repeatedBigrams / bigrams.size : 0
    return Math.min(1, repeatRatio * 0.7 + bigramRepeat * 0.3)
  }

  private computeFormalityScore(text: string, tokens: string[]): number {
    const formalMarkers = [
      'therefore',
      'however',
      'furthermore',
      'additionally',
      'consequently',
      'moreover',
      'regarding',
      'regards',
      'sincerely',
      'kindly',
      'please find',
      'hereby',
      'aforementioned',
      'hence',
      'thus',
    ]
    const contractions = (text.match(/\b(won't|can't|don't|it's|that's|we're|they're|i'm|you're|isn't|aren't|wasn't|weren't)\b/gi) ?? []).length
    const formalCount = formalMarkers.filter((m) =>
      text.toLowerCase().includes(m)
    ).length
    const noContractions = tokens.length > 10 && contractions === 0
    const formalScore = Math.min(1, formalCount * 0.15 + (noContractions ? 0.2 : 0))
    return formalScore
  }

  /**
   * Detect potential factual issues: exaggerated claims, contradictions (simple heuristics).
   */
  analyzeFactualClaims(text: string): { indicators: string[]; details: string[] } {
    const indicators: string[] = []
    const details: string[] = []
    const lower = text.toLowerCase()

    const impossiblePhrases = [
      'guaranteed 100%',
      '100% free',
      'no risk',
      'zero risk',
      'act now or miss out',
      'limited to the first',
      'only today',
      'once in a lifetime',
      'secret that',
      'banks don\'t want you to know',
    ]
    for (const p of impossiblePhrases) {
      if (lower.includes(p)) {
        indicators.push('Possible exaggerated or impossible claim')
        details.push(`Phrase "${p}" often appears in scams or AI-generated pitches`)
      }
    }

    const contradictionPairs: [string, string][] = [
      ['urgent', 'take your time'],
      ['immediately', 'whenever you can'],
      ['free', 'small fee'],
      ['guaranteed', 'no refunds'],
    ]
    for (const [a, b] of contradictionPairs) {
      if (lower.includes(a) && lower.includes(b)) {
        indicators.push('Potential contradiction in message')
        details.push(`Both "${a}" and "${b}" appear in the same text`)
      }
    }

    return { indicators, details }
  }
}
