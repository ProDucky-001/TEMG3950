/**
 * Content analysis: generic greetings, sensitive info requests, risky attachments, grammar in "official" context.
 * Weight: 5-15 each (MEDIUM PRIORITY).
 */

import type { Finding } from '../types';
import { GENERIC_GREETINGS, SENSITIVE_REQUEST_PATTERNS, RISKY_EXTENSIONS } from '../constants';

const WEIGHT_MIN = 5;
const WEIGHT_MAX = 15;

function addFinding(
  findings: Finding[],
  type: string,
  severity: 'low' | 'medium' | 'high',
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

export function analyzeContent(text: string, options?: { attachmentNames?: string[] }): Finding[] {
  const findings: Finding[] = [];

  for (const pattern of GENERIC_GREETINGS) {
    const m = text.match(pattern);
    if (m) {
      addFinding(
        findings,
        'content_generic_greeting',
        'medium',
        'Generic greeting: "Dear Customer", "Dear User" common in phishing',
        m[0],
        WEIGHT_MIN + 2
      );
      break;
    }
  }

  for (const pattern of SENSITIVE_REQUEST_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      addFinding(
        findings,
        'content_sensitive_request',
        'high',
        'Requests for sensitive info: password, SSN, credit card, PIN',
        m[0].slice(0, 60),
        WEIGHT_MAX
      );
      break;
    }
  }

  if (options?.attachmentNames?.length) {
    for (const name of options.attachmentNames) {
      const lower = name.toLowerCase();
      const ext = lower.includes('.') ? '.' + lower.split('.').pop()! : '';
      if (RISKY_EXTENSIONS.has(ext)) {
        addFinding(
          findings,
          'content_risky_attachment',
          'high',
          `Risky attachment extension: ${ext} (executables, scripts)`,
          name,
          WEIGHT_MAX - 2
        );
        break;
      }
    }
  }

  return findings;
}
