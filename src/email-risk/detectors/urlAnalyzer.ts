/**
 * Analyzes URLs for suspicious patterns: misspellings, shorteners, suspicious TLDs, IPs, lookalikes.
 * Weight: 15-30 each (HIGH PRIORITY).
 */

import type { Finding } from '../types';
import {
  BRAND_NAMES,
  SUSPICIOUS_TLDS,
  URL_SHORTENERS,
  IPV4_PATTERN,
  MAX_SUBDOMAINS_NORMAL,
} from '../constants';
import { getHostname, countSubdomains, getBrandLookalike, hasLookalikeCharacters } from '../utils';

const WEIGHT_MIN = 15;
const WEIGHT_MAX = 30;

function addFinding(
  findings: Finding[],
  type: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
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

export function analyzeUrls(urls: string[]): Finding[] {
  const findings: Finding[] = [];
  const seenTypes = new Set<string>();

  for (const urlStr of urls) {
    const host = getHostname(urlStr);
    if (!host) continue;

    const fullUrl = urlStr.length > 80 ? urlStr.slice(0, 80) + '...' : urlStr;

    const brandLookalike = getBrandLookalike(host, BRAND_NAMES);
    if (brandLookalike && !seenTypes.has('url_brand_lookalike')) {
      seenTypes.add('url_brand_lookalike');
      addFinding(
        findings,
        'url_brand_lookalike',
        'high',
        `URL may mimic brand "${brandLookalike}" with lookalike characters`,
        fullUrl,
        WEIGHT_MAX - 5
      );
    }

    if (hasLookalikeCharacters(host) && !seenTypes.has('url_lookalike_chars')) {
      seenTypes.add('url_lookalike_chars');
      addFinding(
        findings,
        'url_lookalike_chars',
        'high',
        'URL uses lookalike characters (e.g. 0/o, 1/l, rn/m)',
        fullUrl,
        WEIGHT_MAX - 10
      );
    }

    const tld = '.' + host.split('.').pop();
    if (SUSPICIOUS_TLDS.has(tld) && !seenTypes.has('url_suspicious_tld')) {
      seenTypes.add('url_suspicious_tld');
      addFinding(
        findings,
        'url_suspicious_tld',
        'high',
        `Suspicious TLD: ${tld} often used in phishing`,
        fullUrl,
        WEIGHT_MIN + 5
      );
    }

    if (URL_SHORTENERS.has(host) && !seenTypes.has('url_shortener')) {
      seenTypes.add('url_shortener');
      addFinding(
        findings,
        'url_shortener',
        'medium',
        'URL shortener hides real destination (bit.ly, tinyurl, t.co, etc.)',
        fullUrl,
        WEIGHT_MIN + 5
      );
    }

    if (IPV4_PATTERN.test(host) && !seenTypes.has('url_ip_address')) {
      seenTypes.add('url_ip_address');
      addFinding(
        findings,
        'url_ip_address',
        'high',
        'URL uses IP address instead of domain name',
        fullUrl,
        WEIGHT_MAX - 5
      );
    }

    const subdomains = countSubdomains(host);
    if (subdomains > MAX_SUBDOMAINS_NORMAL && !seenTypes.has('url_excessive_subdomains')) {
      seenTypes.add('url_excessive_subdomains');
      addFinding(
        findings,
        'url_excessive_subdomains',
        'medium',
        `Excessive subdomains (${subdomains}) may mimic legitimate URLs`,
        fullUrl,
        WEIGHT_MIN
      );
    }

    if (
      urlStr.toLowerCase().startsWith('http://') &&
      /login|signin|account|secure|verify|password|billing/i.test(urlStr) &&
      !seenTypes.has('url_http_sensitive')
    ) {
      seenTypes.add('url_http_sensitive');
      addFinding(
        findings,
        'url_http_sensitive',
        'high',
        'HTTP (not HTTPS) used for login/sensitive page',
        fullUrl,
        WEIGHT_MAX - 10
      );
    }
  }

  return findings;
}
