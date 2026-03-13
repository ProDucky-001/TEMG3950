/**
 * Performance benchmarks for the phishing email risk detector.
 * MUST pass: small <50ms, medium <200ms, large <500ms, very large <1500ms, 100 emails <5s.
 */

import { analyzeEmailRisk } from '../../src/email-risk/index';

function repeat(str: string, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += str;
  return out;
}

const SMALL_EMAIL = `
Subject: Your OneDrive is full - Upgrade now

Dear Customer,
Your storage has exceeded the limit. Upgrade within 24 hours.
Click here: https://secure-onedrive.xyz.com/upgrade
`.trim();

const MEDIUM_EMAIL = repeat(
  `
Subject: Verify your account immediately

Your Microsoft account has been compromised. Verify your account immediately to avoid suspension.
Account will be suspended in 48 hours if you do not confirm your identity.
Sign in here: https://micros0ft-secure.xyz/login
Payment failed. Update your billing information. Invoice attached.
`.trim() + '\n',
  15
).trim();

const LARGE_EMAIL = repeat(
  `
Subject: Urgent - Final warning

Dear User, Your OneDrive is full. Mailbox storage exceeded. Google Drive quota reached.
Account will be suspended. Verify immediately. Payment failed. Update billing.
Reset your password now. Security alert. Act now. Limited time. Expires today.
https://bit.ly/abc123 https://example.xyz https://example.top
`.trim() + '\n',
  80
).trim();

const VERY_LARGE_EMAIL = repeat(
  `
Subject: Important notice

Dear Customer, please verify your account. Storage limit reached. Payment declined.
Update your payment method. Reset password. Unusual activity detected.
Immediate action required. Will be terminated. Permanently deleted. Lose access.
Only 24 hours left. Final warning. Limited time offer.
`.trim() + '\n',
  400
).trim();

describe('Performance Benchmarks', () => {
  it('should analyze small email (<1KB) in <50ms', () => {
    const start = performance.now();
    analyzeEmailRisk({ text: SMALL_EMAIL });
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(50);
  });

  it('should analyze medium email (1-10KB) in <200ms', () => {
    const start = performance.now();
    analyzeEmailRisk({ text: MEDIUM_EMAIL });
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(200);
  });

  it('should analyze large email (10-50KB) in <500ms', () => {
    const start = performance.now();
    analyzeEmailRisk({ text: LARGE_EMAIL });
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(500);
  });

  it('should analyze very large email (>50KB) in <1500ms', () => {
    const start = performance.now();
    analyzeEmailRisk({ text: VERY_LARGE_EMAIL });
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(1500);
  });

  it('should handle 100 medium emails in <5 seconds', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      analyzeEmailRisk({ text: MEDIUM_EMAIL });
    }
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(5000);
  });
});
