/**
 * Types for the Phishing Email Risk Detection module.
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Finding {
  type: string;
  severity: FindingSeverity;
  description: string;
  matchedText?: string;
  weight: number;
}

export interface RiskAnalysisResult {
  riskScore: number;
  riskLevel: RiskLevel;
  findings: Finding[];
  summary: string;
}

export interface EmailRiskInput {
  /** Raw email text (subject + body). */
  text: string;
  /** Optional array of extracted URLs from the email. */
  urls?: string[];
  /** Optional sender email address for sender analysis. */
  senderEmail?: string;
  /** Optional display name (e.g. "Microsoft Support"). */
  senderDisplayName?: string;
  /** Optional reply-to address. */
  replyTo?: string;
  /** Optional attachment file names for risky-extension check. */
  attachmentNames?: string[];
}

export interface WeightConfig {
  base: number;
  max: number;
}

export const DEFAULT_WEIGHTS = {
  phishingPattern: { base: 30, max: 50 },
  suspiciousUrl: { base: 20, max: 40 },
  urgencyIndicator: { base: 15, max: 30 },
  senderRedFlag: { base: 10, max: 20 },
  contentIssue: { base: 10, max: 20 },
  linkQuantity: { base: 2, max: 5 },
} as const;

/** Risk level thresholds (inclusive upper bound for each band). */
export const RISK_LEVEL_THRESHOLDS = {
  low: 20,
  medium: 50,
  high: 75,
  critical: 100,
} as const;
