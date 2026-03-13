/**
 * Unit tests for the Phishing Email Risk Detector.
 */

import { analyzeEmailRisk, scoreToRiskLevel } from '../../src/email-risk/index';
import {
  ONEDRIVE_STORAGE_SCAM,
  MICROSOFT_ACCOUNT_VERIFICATION,
  PAYPAL_PAYMENT_FAILED,
  MIXED_URGENCY_AND_SHORTENER,
  FREE_EMAIL_CLAIMING_CORP,
  SENSITIVE_INFO_REQUEST,
  MULTIPLE_LINKS_AND_ATTACHMENT,
} from '../fixtures/phishingEmails';
import {
  LEGITIMATE_NEWSLETTER,
  LEGITIMATE_PASSWORD_RESET,
  LEGITIMATE_ORDER_CONFIRMATION,
  PLAIN_TEXT_NO_LINKS,
  NEWSLETTER_MANY_LINKS,
} from '../fixtures/legitimateEmails';

describe('analyzeEmailRisk', () => {
  it('is a pure function with no side effects', () => {
    const input = { text: 'Test' };
    const r1 = analyzeEmailRisk(input);
    const r2 = analyzeEmailRisk(input);
    expect(r1.riskScore).toBe(r2.riskScore);
    expect(r1.findings.length).toBe(r2.findings.length);
  });

  it('returns result with riskScore 0-100, riskLevel, findings, summary', () => {
    const result = analyzeEmailRisk({ text: 'Hello' });
    expect(typeof result.riskScore).toBe('number');
    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
    expect(Array.isArray(result.findings)).toBe(true);
    expect(typeof result.summary).toBe('string');
  });

  it('completes in under 50ms for typical email', () => {
    const longText = 'Test. '.repeat(2000) + ' OneDrive is full and account will be suspended.';
    const start = performance.now();
    analyzeEmailRisk({ text: longText });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

describe('Phishing scenarios', () => {
  it('scores OneDrive storage scam as high/critical', () => {
    const result = analyzeEmailRisk({
      text: ONEDRIVE_STORAGE_SCAM,
      urls: ['http://secure-onedrive-verify.xyz.com/upgrade'],
    });
    expect(result.riskScore).toBeGreaterThanOrEqual(50);
    expect(['high', 'critical']).toContain(result.riskLevel);
    const types = result.findings.map((f) => f.type);
    expect(types.some((t) => t.startsWith('phishing_'))).toBe(true);
  });

  it('scores Microsoft account verification phishing as high/critical', () => {
    const result = analyzeEmailRisk({
      text: MICROSOFT_ACCOUNT_VERIFICATION,
      urls: ['https://micros0ft-secure.xyz/login'],
      replyTo: 'support@outlook.xyz',
    });
    expect(result.riskScore).toBeGreaterThanOrEqual(50);
    const types = result.findings.map((f) => f.type);
    expect(types.some((t) => t.includes('phishing') || t.includes('url') || t.includes('urgency'))).toBe(true);
  });

  it('scores PayPal payment failed scam as high/critical', () => {
    const result = analyzeEmailRisk({
      text: PAYPAL_PAYMENT_FAILED,
      urls: ['https://paypa1-billing.top/update'],
    });
    expect(result.riskScore).toBeGreaterThanOrEqual(50);
    expect(result.findings.some((f) => f.type.includes('phishing') || f.type.includes('url'))).toBe(true);
  });

  it('flags urgency, shorteners, and generic greetings', () => {
    const result = analyzeEmailRisk({
      text: MIXED_URGENCY_AND_SHORTENER,
      urls: ['https://bit.ly/abc123xyz', 'http://192.168.1.1/secure-login'],
    });
    expect(result.riskScore).toBeGreaterThanOrEqual(40);
    expect(result.findings.some((f) => f.type.includes('urgency'))).toBe(true);
    expect(result.findings.some((f) => f.type.includes('shortener') || f.type.includes('ip'))).toBe(true);
  });

  it('flags free email claiming to be corporation (sender red flag)', () => {
    const result = analyzeEmailRisk({
      text: FREE_EMAIL_CLAIMING_CORP,
      senderEmail: 'microsoft-support@gmail.com',
      senderDisplayName: 'Microsoft Support',
    });
    expect(result.findings.some((f) => f.type.includes('sender_free'))).toBe(true);
    expect(result.riskScore).toBeGreaterThanOrEqual(30);
  });

  it('flags sensitive info requests', () => {
    const result = analyzeEmailRisk({ text: SENSITIVE_INFO_REQUEST });
    expect(result.findings.some((f) => f.type.includes('sensitive_request'))).toBe(true);
  });

  it('flags risky attachment and multiple suspicious URLs', () => {
    const result = analyzeEmailRisk({
      text: MULTIPLE_LINKS_AND_ATTACHMENT,
      urls: [
        'https://example.xyz',
        'https://example.top',
        'https://example.click',
        'https://tinyurl.com/abc',
        'https://goo.gl/xyz',
      ],
      attachmentNames: ['document.scr'],
    });
    expect(result.findings.some((f) => f.type.includes('risky_attachment'))).toBe(true);
    expect(result.findings.some((f) => f.type.includes('suspicious_tld') || f.type.includes('shortener'))).toBe(true);
  });
});

describe('Legitimate emails', () => {
  it('scores legitimate newsletter LOW', () => {
    const result = analyzeEmailRisk({ text: LEGITIMATE_NEWSLETTER });
    expect(result.riskScore).toBeLessThanOrEqual(30);
    expect(result.riskLevel).toBe('low');
  });

  it('scores legitimate password reset from known service LOW', () => {
    const result = analyzeEmailRisk({
      text: LEGITIMATE_PASSWORD_RESET,
      urls: ['https://accounts.exampleservice.com/reset?token=abc123'],
    });
    expect(result.riskScore).toBeLessThanOrEqual(50);
    expect(result.riskLevel).toBe('low');
  });

  it('scores order confirmation LOW', () => {
    const result = analyzeEmailRisk({ text: LEGITIMATE_ORDER_CONFIRMATION });
    expect(result.riskScore).toBeLessThanOrEqual(25);
  });

  it('scores plain text with no links LOW', () => {
    const result = analyzeEmailRisk({ text: PLAIN_TEXT_NO_LINKS });
    expect(result.riskScore).toBeLessThanOrEqual(20);
    expect(result.findings.length).toBe(0);
  });

  it('does NOT score newsletter with many links high just for link count', () => {
    const result = analyzeEmailRisk({
      text: NEWSLETTER_MANY_LINKS,
      urls: Array.from({ length: 10 }, (_, i) => `https://medium.com/article${i + 1}`),
    });
    expect(result.riskScore).toBeLessThanOrEqual(35);
    const linkQ = result.findings.find((f) => f.type === 'link_quantity');
    if (linkQ) expect(linkQ.weight).toBeLessThanOrEqual(5);
  });
});

describe('scoreToRiskLevel', () => {
  it('maps 0-20 to low', () => {
    expect(scoreToRiskLevel(0)).toBe('low');
    expect(scoreToRiskLevel(10)).toBe('low');
    expect(scoreToRiskLevel(20)).toBe('low');
  });
  it('maps 21-50 to medium', () => {
    expect(scoreToRiskLevel(21)).toBe('medium');
    expect(scoreToRiskLevel(50)).toBe('medium');
  });
  it('maps 51-75 to high', () => {
    expect(scoreToRiskLevel(51)).toBe('high');
    expect(scoreToRiskLevel(75)).toBe('high');
  });
  it('maps 76-100 to critical', () => {
    expect(scoreToRiskLevel(76)).toBe('critical');
    expect(scoreToRiskLevel(100)).toBe('critical');
  });
  it('clamps out-of-range scores', () => {
    expect(scoreToRiskLevel(-1)).toBe('low');
    expect(scoreToRiskLevel(150)).toBe('critical');
  });
});

describe('Zmail / account-expiry style phishing', () => {
  it('flags Zmail upgrade + reactivate + bit.ly + urgent + .xyz as high/critical', () => {
    const text = `Dear User, All gmail users have been upgraded to Zmail.com as the account services has expired. You can reactivate your account through http://bit.ly/zmailreal/ Urgent action required. Click onto  this link bit.ly, malware.xyz`;
    const result = analyzeEmailRisk({ text });
    expect(result.riskScore).toBeGreaterThanOrEqual(50);
    expect(['high', 'critical']).toContain(result.riskLevel);
    const types = result.findings.map((f) => f.type);
    expect(types.some((t) => t.includes('phishing') || t.includes('account'))).toBe(true);
    expect(types.some((t) => t.includes('urgency') || t.includes('urgent'))).toBe(true);
    expect(result.summary).not.toMatch(/not suspicious|no suspicious indicators/i);
    expect(result.summary.length).toBeLessThan(120);
  });
});

describe('findings structure', () => {
  it('each finding has type, severity, description, weight, and optional matchedText', () => {
    const result = analyzeEmailRisk({
      text: 'Your OneDrive is full. Act now!!!',
      urls: ['https://bit.ly/x'],
    });
    for (const f of result.findings) {
      expect(typeof f.type).toBe('string');
      expect(['low', 'medium', 'high', 'critical']).toContain(f.severity);
      expect(typeof f.description).toBe('string');
      expect(typeof f.weight).toBe('number');
      expect(f.weight).toBeGreaterThanOrEqual(0);
    }
  });
});
