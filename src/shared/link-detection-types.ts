/**
 * Link detection engine types for ScamShield.
 */

export enum ThreatType {
  Phishing = 'phishing',
  Malware = 'malware',
  Scam = 'scam',
  Suspicious = 'suspicious',
}

export interface LinkDetectionResult {
  /** Risk score 0-100 (higher = more dangerous) */
  riskScore: number
  /** Detected threat categories */
  threatTypes: ThreatType[]
  /** Human-readable description of findings */
  explanation: string
  /** Suggested actions for the user */
  recommendations: string[]
  /** Confidence in the assessment (0.0-1.0) */
  confidence: number
  /** Original URL analyzed */
  url: string
  /** Resolved/final URL after redirects or shortener expansion (if applicable) */
  resolvedUrl?: string
  /** Per-category risk breakdown for transparency */
  riskBreakdown: RiskBreakdownItem[]
  /** Timestamp of analysis */
  analyzedAt: number
}

export interface RiskBreakdownItem {
  category: string
  score: number
  maxScore: number
  reason: string
}

export interface ScamPatternEntry {
  pattern: string
  type: 'domain' | 'keyword' | 'phrase'
  threatType: ThreatType
  source?: string
}

export interface KnownDomainEntry {
  domain: string
  threatType: ThreatType
  firstSeen: number
  source?: string
}

export interface RecentDetectionEntry {
  url: string
  riskScore: number
  threatTypes: ThreatType[]
  detectedAt: number
}

export interface ScamDatabaseSchema {
  version: number
  knownMaliciousDomains: KnownDomainEntry[]
  phishingKeywords: string[]
  scamPhrases: string[]
  recentDetections: RecentDetectionEntry[]
  lastUpdated: number
}
