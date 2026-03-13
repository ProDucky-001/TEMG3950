/**
 * Sender red flags: mismatched display name vs domain, free email claiming to be corp, reply-to mismatch.
 * Weight: 5-15 each (MEDIUM PRIORITY).
 */

import type { Finding } from '../types';

const WEIGHT_MIN = 5;
const WEIGHT_MAX = 15;

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'aol.com',
  'mail.com',
  'protonmail.com',
  'yandex.com',
  'gmx.com',
  'zoho.com',
]);

const CORPORATE_NAMES = [
  'microsoft',
  'apple',
  'google',
  'amazon',
  'paypal',
  'netflix',
  'bank',
  'chase',
  'wells fargo',
  'support',
  'security',
  'account',
  'billing',
  'noreply',
  'no-reply',
];

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at === -1) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

function displayNameSuggestsCorp(displayName: string): boolean {
  const lower = (displayName || '').toLowerCase();
  return CORPORATE_NAMES.some((c) => lower.includes(c));
}

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

export function analyzeSender(input: {
  senderEmail?: string;
  senderDisplayName?: string;
  replyTo?: string;
}): Finding[] {
  const findings: Finding[] = [];
  const { senderEmail, senderDisplayName, replyTo } = input;

  if (!senderEmail) return findings;

  const senderDomain = extractDomain(senderEmail);
  if (!senderDomain) return findings;

  if (senderDisplayName && displayNameSuggestsCorp(senderDisplayName)) {
    if (FREE_EMAIL_DOMAINS.has(senderDomain)) {
      addFinding(
        findings,
        'sender_free_claims_corp',
        'high',
        'Free email provider (Gmail, Yahoo, etc.) with corporate-looking display name',
        `${senderDisplayName} <${senderEmail}>`,
        WEIGHT_MAX
      );
    }
  }

  if (replyTo) {
    const replyDomain = extractDomain(replyTo);
    if (replyDomain && senderDomain !== replyDomain) {
      addFinding(
        findings,
        'sender_replyto_mismatch',
        'medium',
        'Reply-To address differs from sender domain',
        `From: ${senderDomain} Reply-To: ${replyDomain}`,
        WEIGHT_MIN + 5
      );
    }
  }

  return findings;
}
