/**
 * Main phishing email risk detector.
 * Uses optimized single-pass analyzer with early exit. Target: <100ms typical, <1.5s max.
 */

import type { RiskAnalysisResult, EmailRiskInput, Finding } from './types';
import { DEFAULT_WEIGHTS, RISK_LEVEL_THRESHOLDS } from './types';
import { scoreToRiskLevel } from './utils';
import { analyzeEmailOptimized, computeScoreFromFindings } from './analyzer';

/** Short labels for findings (succinct log under risk score). No unhelpful "link not suspicious" text. */
const FINDING_LABELS: Record<string, string> = {
  phishing_storage: 'Storage/quota scam',
  phishing_account_suspension: 'Account threat or reactivation',
  phishing_payment: 'Payment/billing scam',
  phishing_password: 'Password/security scam',
  urgency_time_pressure: 'Urgency',
  urgency_threat: 'Threat language',
  urgency_scarcity: 'Scarcity',
  urgency_exclamation: 'Exclamation marks',
  urgency_all_caps: 'ALL CAPS',
  content_generic_greeting: 'Generic greeting',
  content_sensitive_request: 'Sensitive data request',
  content_risky_attachment: 'Risky attachment',
  content_inline_shortener_tld: 'Shortener or .xyz/.top in text',
  url_suspicious_tld: 'Suspicious TLD',
  url_shortener: 'URL shortener',
  url_ip_address: 'IP in URL',
  url_http_sensitive: 'HTTP on login/sensitive',
  url_excessive_subdomains: 'Too many subdomains',
  url_brand_lookalike: 'Brand lookalike URL',
  url_lookalike_chars: 'Lookalike characters in URL',
  sender_free_claims_corp: 'Free email posing as company',
  sender_replyto_mismatch: 'Reply-To mismatch',
  link_quantity: 'Many links',
};

function buildSummary(score: number, findings: Finding[]): string {
  const level = scoreToRiskLevel(score);
  if (findings.length === 0) {
    return `Risk level: ${level}.`;
  }
  const labels: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < findings.length; i++) {
    const label = FINDING_LABELS[findings[i].type] ?? findings[i].type;
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  const part = labels.slice(0, 5).join('; ');
  return `Risk level: ${level}. ${part}`;
}

/**
 * Analyze email text (and optional URLs/sender) and return risk score with detailed findings.
 * Pure function; no side effects. Uses pre-compiled regex, single-pass text scan, early exit, and lazy URL limit (10).
 */
export function analyzeEmailRisk(input: EmailRiskInput): RiskAnalysisResult {
  const { findings } = analyzeEmailOptimized({
    text: input.text,
    urls: input.urls,
    senderEmail: input.senderEmail,
    senderDisplayName: input.senderDisplayName,
    replyTo: input.replyTo,
    attachmentNames: input.attachmentNames,
  });

  const riskScore = computeScoreFromFindings(findings);
  const riskLevel = scoreToRiskLevel(riskScore);
  const summary = buildSummary(riskScore, findings);

  return {
    riskScore,
    riskLevel,
    findings,
    summary,
  };
}

export type { RiskAnalysisResult, Finding, EmailRiskInput, RiskLevel } from './types';
export { DEFAULT_WEIGHTS, RISK_LEVEL_THRESHOLDS } from './types';
export { scoreToRiskLevel } from './utils';
