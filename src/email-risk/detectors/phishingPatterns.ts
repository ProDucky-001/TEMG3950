/**
 * Detects phishing patterns: storage/quota scams, account suspension, payment, password reset.
 * Weight: 25-40 each (CRITICAL PRIORITY).
 */

import type { Finding, FindingSeverity } from '../types';
import { PHISHING_PATTERNS } from '../constants';

const WEIGHT_MIN = 25;
const WEIGHT_MAX = 40;

function addFinding(
  findings: Finding[],
  type: string,
  severity: FindingSeverity,
  description: string,
  matchedText: string | undefined,
  weight: number
): void {
  findings.push({
    type,
    severity,
    description,
    matchedText,
    weight: Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, weight)),
  });
}

export function detectPhishingPatterns(text: string): Finding[] {
  const findings: Finding[] = [];

  for (const pattern of PHISHING_PATTERNS.storage) {
    const m = text.match(pattern);
    if (m) {
      addFinding(
        findings,
        'phishing_storage',
        'critical',
        'Storage/quota scam: common phishing scenario (OneDrive/Drive/iCloud full, mailbox exceeded)',
        m[0],
        WEIGHT_MIN + 5
      );
      break;
    }
  }

  for (const pattern of PHISHING_PATTERNS.accountSuspension) {
    const m = text.match(pattern);
    if (m) {
      addFinding(
        findings,
        'phishing_account_suspension',
        'critical',
        'Account suspension/verification threat: common phishing tactic',
        m[0],
        WEIGHT_MIN + 10
      );
      break;
    }
  }

  for (const pattern of PHISHING_PATTERNS.payment) {
    const m = text.match(pattern);
    if (m) {
      addFinding(
        findings,
        'phishing_payment',
        'critical',
        'Payment/billing scam: payment failed, update billing, invoice attached',
        m[0],
        WEIGHT_MIN + 5
      );
      break;
    }
  }

  for (const pattern of PHISHING_PATTERNS.password) {
    const m = text.match(pattern);
    if (m) {
      addFinding(
        findings,
        'phishing_password',
        'critical',
        'Password reset/security alert: common phishing scenario',
        m[0],
        WEIGHT_MIN + 5
      );
      break;
    }
  }

  return findings;
}
