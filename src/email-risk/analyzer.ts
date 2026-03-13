/**
 * Core single-pass analyzer with early exit. Uses pre-compiled patterns and normalized text.
 */

import type { Finding, FindingSeverity } from './types';
import { normalizeEmail } from './utils/normalizer';
import {
  PHISHING_COMBINED,
  URGENCY_COMBINED,
  URGENCY_EXCLAM,
  URGENCY_CAPS,
  CONTENT_COMBINED,
  CONTENT_SENSITIVE,
  TEXT_SHORTENER_OR_TLD,
  URL_EXTRACT,
  URL_HTTP_SENSITIVE,
  SENSITIVE_PATH,
  IPV4_HOST,
} from './patterns/compiled';
import {
  SUSPICIOUS_TLDS,
  URL_SHORTENERS,
  RISKY_EXTENSIONS,
  FREE_EMAIL_DOMAINS,
  CORPORATE_NAMES,
  MAX_URLS_TO_ANALYZE,
  MAX_SUBDOMAINS_NORMAL,
  CRITICAL_THRESHOLD,
} from './patterns/lookups';
import { BRAND_NAMES } from './constants';

const W_PHISHING = 35;
const W_URGENCY_H = 20;
const W_URGENCY_M = 12;
const W_CONTENT_GREETING = 8;
const W_CONTENT_SENSITIVE = 15;
const W_CONTENT_INLINE_SHORTENER_TLD = 22;
const W_URL_TLD = 20;
const W_URL_SHORTENER = 18;
const W_URL_IP = 25;
const W_URL_HTTP = 22;
const W_URL_SUBDOMAINS = 15;
const W_SENDER_FREE = 15;
const W_SENDER_REPLYTO = 10;
const W_ATTACHMENT = 13;

/** Pre-built brand lookalike regexes (one per brand) at module load. */
const BRAND_REGEXES: Array<{ name: string; re: RegExp }> = (() => {
  const out: Array<{ name: string; re: RegExp }> = [];
  for (let i = 0; i < BRAND_NAMES.length; i++) {
    const brand = BRAND_NAMES[i];
    const fuzzy = brand
      .replace(/o/g, '[o0]')
      .replace(/l/g, '[l1|i]')
      .replace(/i/g, '[i1l]')
      .replace(/s/g, '[s5$]')
      .replace(/a/g, '[a4@]')
      .replace(/e/g, '[e3]')
      .replace(/m/g, '(m|rn|nn)')
      .replace(/n/g, '(n|rn)');
    out.push({ name: brand, re: new RegExp(fuzzy, 'i') });
  }
  return out;
})();

function pushFinding(
  findings: Finding[],
  type: string,
  severity: FindingSeverity,
  description: string,
  matchedText: string | undefined,
  weight: number
): void {
  findings.push({ type, severity, description, matchedText, weight });
}

const CATEGORY_MAX: Record<string, number> = {
  phishing_storage: 50,
  phishing_account_suspension: 50,
  phishing_payment: 50,
  phishing_password: 50,
  urgency_time_pressure: 30,
  urgency_threat: 30,
  urgency_scarcity: 25,
  urgency_exclamation: 15,
  urgency_all_caps: 12,
  content_generic_greeting: 20,
  content_sensitive_request: 20,
  content_risky_attachment: 20,
  content_inline_shortener_tld: 35,
  url_suspicious_tld: 40,
  url_shortener: 40,
  url_ip_address: 40,
  url_http_sensitive: 40,
  url_excessive_subdomains: 25,
  url_brand_lookalike: 40,
  url_lookalike_chars: 35,
  sender_free_claims_corp: 20,
  sender_replyto_mismatch: 20,
  link_quantity: 5,
};

function scoreFindings(findings: Finding[]): number {
  const sum: Record<string, number> = {};
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const max = CATEGORY_MAX[f.type] ?? 30;
    const cur = sum[f.type] ?? 0;
    sum[f.type] = Math.min(max, cur + f.weight);
  }
  let total = 0;
  for (const k in sum) total += sum[k];
  return Math.min(100, Math.round(total));
}

/** Exported for riskDetector to compute final score. */
export function computeScoreFromFindings(findings: Finding[]): number {
  return scoreFindings(findings);
}

function getHostname(urlStr: string): string | null {
  try {
    const u = new URL(urlStr.startsWith('http') ? urlStr : 'https://' + urlStr);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function countSubdomains(hostname: string): number {
  const parts = hostname.split('.');
  let n = 0;
  for (let i = 0; i < parts.length; i++) if (parts[i]) n++;
  if (n <= 2) return 0;
  return n - 2;
}

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at === -1) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

function hasLookalike(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (!/\d/.test(lower) || !/[a-z]/.test(lower)) return false;
  if (/[0o]/.test(lower) || /[1li]/.test(lower) || /rn/.test(lower)) return true;
  return false;
}

function extractUrlsLazy(text: string, max: number): string[] {
  const urls: string[] = [];
  const re = URL_EXTRACT;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(text)) !== null && urls.length < max) {
    const raw = m[0];
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(raw);
  }
  return urls;
}

function analyzeUrlFast(
  urlStr: string,
  findings: Finding[],
  seenTypes: Set<string>,
  maxFindings: number
): void {
  if (findings.length >= maxFindings) return;
  const host = getHostname(urlStr);
  if (!host) return;
  const displayUrl = urlStr.length > 80 ? urlStr.slice(0, 80) + '...' : urlStr;

  const tld = '.' + host.split('.').pop()!;
  if (SUSPICIOUS_TLDS.has(tld) && !seenTypes.has('url_suspicious_tld')) {
    seenTypes.add('url_suspicious_tld');
    pushFinding(findings, 'url_suspicious_tld', 'high', `Suspicious TLD: ${tld} often used in phishing`, displayUrl, W_URL_TLD);
  }
  if (URL_SHORTENERS.has(host) && !seenTypes.has('url_shortener')) {
    seenTypes.add('url_shortener');
    pushFinding(findings, 'url_shortener', 'medium', 'URL shortener hides real destination', displayUrl, W_URL_SHORTENER);
  }
  if (IPV4_HOST.test(host) && !seenTypes.has('url_ip_address')) {
    seenTypes.add('url_ip_address');
    pushFinding(findings, 'url_ip_address', 'high', 'URL uses IP address instead of domain name', displayUrl, W_URL_IP);
  }
  const subdomains = countSubdomains(host);
  if (subdomains > MAX_SUBDOMAINS_NORMAL && !seenTypes.has('url_excessive_subdomains')) {
    seenTypes.add('url_excessive_subdomains');
    pushFinding(findings, 'url_excessive_subdomains', 'medium', `Excessive subdomains (${subdomains}) may mimic legitimate URLs`, displayUrl, W_URL_SUBDOMAINS);
  }
  if (URL_HTTP_SENSITIVE.test(urlStr) && SENSITIVE_PATH.test(urlStr) && !seenTypes.has('url_http_sensitive')) {
    seenTypes.add('url_http_sensitive');
    pushFinding(findings, 'url_http_sensitive', 'high', 'HTTP (not HTTPS) used for login/sensitive page', displayUrl, W_URL_HTTP);
  }
  if (hasLookalike(host) && !seenTypes.has('url_lookalike_chars')) {
    seenTypes.add('url_lookalike_chars');
    pushFinding(findings, 'url_lookalike_chars', 'high', 'URL uses lookalike characters (e.g. 0/o, 1/l)', displayUrl, 25);
  }
  for (let i = 0; i < BRAND_REGEXES.length; i++) {
    if (host.includes(BRAND_REGEXES[i].name)) continue;
    if (BRAND_REGEXES[i].re.test(host) && !seenTypes.has('url_brand_lookalike')) {
      seenTypes.add('url_brand_lookalike');
      pushFinding(findings, 'url_brand_lookalike', 'high', `URL may mimic brand "${BRAND_REGEXES[i].name}"`, displayUrl, 28);
      break;
    }
  }
}

export function analyzeTextSinglePass(
  normalized: { original: string; lowercase: string },
  findings: Finding[],
  runningScore: { value: number }
): void {
  const text = normalized.original;
  const lower = normalized.lowercase;

  PHISHING_COMBINED.lastIndex = 0;
  let m = PHISHING_COMBINED.exec(lower);
  if (m) {
    const match = m[0];
    if (/one\s*drive|onedrive|mailbox|storage|quota|icloud|out\s+of\s+storage/i.test(match)) {
      pushFinding(findings, 'phishing_storage', 'critical', 'Storage/quota scam: common phishing scenario', match, W_PHISHING);
    } else if (/account|verify|suspended|compromised|reactivate|confirm\s+your\s+identity/i.test(match)) {
      pushFinding(findings, 'phishing_account_suspension', 'critical', 'Account suspension/verification threat', match, W_PHISHING + 5);
    } else if (/payment|billing|invoice|subscription|renew/i.test(match)) {
      pushFinding(findings, 'phishing_payment', 'critical', 'Payment/billing scam', match, W_PHISHING);
    } else {
      pushFinding(findings, 'phishing_password', 'critical', 'Password reset/security alert: common phishing', match, W_PHISHING);
    }
    runningScore.value = scoreFindings(findings);
    if (runningScore.value >= CRITICAL_THRESHOLD) return;
  }

  URGENCY_COMBINED.lastIndex = 0;
  m = URGENCY_COMBINED.exec(lower);
  if (m) {
    const match = m[0];
    if (/within|immediate|expires|act\s+now|urgent|deadline|midnight|only\s+\d+/i.test(match)) {
      pushFinding(findings, 'urgency_time_pressure', 'high', 'Time pressure: immediate action, expires today', match, W_URGENCY_H);
    } else if (/terminated|deleted|lose\s+access|suspended|warning|last\s+chance/i.test(match)) {
      pushFinding(findings, 'urgency_threat', 'high', 'Threat language: will be terminated, permanently deleted', match, W_URGENCY_H);
    } else {
      pushFinding(findings, 'urgency_scarcity', 'medium', 'Scarcity tactic: limited time, final notice', match, W_URGENCY_M);
    }
    runningScore.value = scoreFindings(findings);
    if (runningScore.value >= CRITICAL_THRESHOLD) return;
  }

  const exclam = text.match(URGENCY_EXCLAM);
  if (exclam && exclam.length >= 2) {
    pushFinding(findings, 'urgency_exclamation', 'medium', 'Multiple exclamation marks (!!!) indicating urgency', exclam[0], 10);
  }
  URGENCY_CAPS.lastIndex = 0;
  const capsM = URGENCY_CAPS.exec(text);
  if (capsM && capsM[1] && capsM[1].length >= 12) {
    pushFinding(findings, 'urgency_all_caps', 'low', 'ALL CAPS phrase often used to create urgency', capsM[1].slice(0, 50), 10);
  }

  CONTENT_COMBINED.lastIndex = 0;
  m = CONTENT_COMBINED.exec(lower);
  if (m) {
    const match = m[0];
    pushFinding(findings, 'content_generic_greeting', 'medium', 'Generic greeting: Dear Customer, Dear User common in phishing', match, W_CONTENT_GREETING);
  }
  CONTENT_SENSITIVE.lastIndex = 0;
  m = CONTENT_SENSITIVE.exec(lower);
  if (m) {
    const match = m[0];
    pushFinding(findings, 'content_sensitive_request', 'high', 'Requests for sensitive info: password, SSN, credit card, PIN', match.slice(0, 60), W_CONTENT_SENSITIVE);
  }
  TEXT_SHORTENER_OR_TLD.lastIndex = 0;
  m = TEXT_SHORTENER_OR_TLD.exec(lower);
  if (m) {
    pushFinding(findings, 'content_inline_shortener_tld', 'high', 'URL shortener or suspicious TLD mentioned in text (e.g. bit.ly, .xyz)', m[0], W_CONTENT_INLINE_SHORTENER_TLD);
  }
  runningScore.value = scoreFindings(findings);
}

export function analyzeSenderFast(input: {
  senderEmail?: string;
  senderDisplayName?: string;
  replyTo?: string;
}, findings: Finding[]): void {
  const senderEmail = input.senderEmail;
  if (!senderEmail) return;
  const senderDomain = extractDomain(senderEmail);
  if (!senderDomain) return;

  const displayName = (input.senderDisplayName || '').toLowerCase();
  if (displayName) {
    let suggestsCorp = false;
    CORPORATE_NAMES.forEach((c) => {
      if (displayName.includes(c)) suggestsCorp = true;
    });
    if (suggestsCorp && FREE_EMAIL_DOMAINS.has(senderDomain)) {
      pushFinding(findings, 'sender_free_claims_corp', 'high', 'Free email provider with corporate-looking display name', `${input.senderDisplayName} <${senderEmail}>`, W_SENDER_FREE);
    }
  }
  if (input.replyTo) {
    const replyDomain = extractDomain(input.replyTo);
    if (replyDomain && senderDomain !== replyDomain) {
      pushFinding(findings, 'sender_replyto_mismatch', 'medium', 'Reply-To address differs from sender domain', `From: ${senderDomain} Reply-To: ${replyDomain}`, W_SENDER_REPLYTO);
    }
  }
}

export function analyzeAttachmentsFast(attachmentNames: string[] | undefined, findings: Finding[]): void {
  if (!attachmentNames || attachmentNames.length === 0) return;
  for (let i = 0; i < attachmentNames.length; i++) {
    const name = attachmentNames[i].toLowerCase();
    const dot = name.lastIndexOf('.');
    const ext = dot >= 0 ? name.slice(dot) : '';
    if (RISKY_EXTENSIONS.has(ext)) {
      pushFinding(findings, 'content_risky_attachment', 'high', `Risky attachment extension: ${ext}`, attachmentNames[i], W_ATTACHMENT);
      return;
    }
  }
}

export function analyzeEmailOptimized(input: {
  text: string;
  urls?: string[];
  senderEmail?: string;
  senderDisplayName?: string;
  replyTo?: string;
  attachmentNames?: string[];
}): { findings: Finding[]; urlCount: number } {
  const text = (input.text || '').trim();
  const normalized = normalizeEmail(text);
  const findings: Finding[] = [];
  const runningScore = { value: 0 };

  analyzeTextSinglePass(normalized, findings, runningScore);
  if (runningScore.value >= CRITICAL_THRESHOLD) {
    return { findings, urlCount: 0 };
  }

  const urls = input.urls ?? extractUrlsLazy(text, MAX_URLS_TO_ANALYZE);
  const seenUrlTypes = new Set<string>();
  const maxUrlFindings = 8;
  for (let i = 0; i < urls.length; i++) {
    analyzeUrlFast(urls[i], findings, seenUrlTypes, maxUrlFindings);
    if (scoreFindings(findings) >= CRITICAL_THRESHOLD) break;
  }

  analyzeSenderFast(
    { senderEmail: input.senderEmail, senderDisplayName: input.senderDisplayName, replyTo: input.replyTo },
    findings
  );
  analyzeAttachmentsFast(input.attachmentNames, findings);

  if (urls.length > 5 && findings.length > 0) {
    const w = Math.min(5, 2 + (urls.length - 5));
    pushFinding(findings, 'link_quantity', 'low', `Many links (${urls.length}) combined with other suspicious indicators`, undefined, w);
  }

  return { findings, urlCount: urls.length };
}
