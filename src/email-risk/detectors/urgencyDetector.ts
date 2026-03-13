/**
 * Detects urgency indicators: time pressure, threats, scarcity, ALL CAPS, multiple exclamation marks.
 * Weight: 10-25 each (HIGH PRIORITY).
 */

import type { Finding, FindingSeverity } from '../types';
import { URGENCY_PATTERNS } from '../constants';

const WEIGHT_MIN = 10;
const WEIGHT_MAX = 25;

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

export function detectUrgency(text: string): Finding[] {
  const findings: Finding[] = [];

  for (const pattern of URGENCY_PATTERNS.timePressure) {
    const m = text.match(pattern);
    if (m) {
      addFinding(
        findings,
        'urgency_time_pressure',
        'high',
        'Time pressure: "within X hours", "immediate action", "expires today"',
        m[0],
        WEIGHT_MAX - 5
      );
      break;
    }
  }

  for (const pattern of URGENCY_PATTERNS.threat) {
    const m = text.match(pattern);
    if (m) {
      addFinding(
        findings,
        'urgency_threat',
        'high',
        'Threat language: "will be terminated", "permanently deleted", "lose access"',
        m[0],
        WEIGHT_MAX - 5
      );
      break;
    }
  }

  for (const pattern of URGENCY_PATTERNS.scarcity) {
    const m = text.match(pattern);
    if (m) {
      addFinding(
        findings,
        'urgency_scarcity',
        'medium',
        'Scarcity tactic: "limited time", "only X hours left", "final warning"',
        m[0],
        WEIGHT_MIN + 5
      );
      break;
    }
  }

  const exclam = text.match(/!!+/g);
  if (exclam && exclam.length >= 2) {
    addFinding(
      findings,
      'urgency_exclamation',
      'medium',
      'Multiple exclamation marks (!!!) indicating urgency',
      exclam.slice(0, 2).join(''),
      WEIGHT_MIN
    );
  }

  const capsPhrase = text.match(/(?:^|\s)([A-Z][A-Z\s]{10,})(?:\s|$|[.!?])/gm);
  if (capsPhrase && capsPhrase.length >= 1) {
    const sample = capsPhrase[0].trim();
    if (sample.length >= 12) {
      addFinding(
        findings,
        'urgency_all_caps',
        'low',
        'ALL CAPS phrase often used to create urgency',
        sample.slice(0, 50),
        WEIGHT_MIN
      );
    }
  }

  return findings;
}
