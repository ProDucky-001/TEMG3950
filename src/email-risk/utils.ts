/**
 * Helper functions for email risk detection.
 */

/**
 * Extract URLs from text using a simple regex (http/https and common patterns).
 */
export function extractUrlsFromText(text: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const re = /https?:\/\/[^\s<>"{}|\\^`[\]]+|(?:www\.)[^\s<>"{}|\\^`[\]]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const normalized = raw.startsWith('www.') ? 'https://' + raw : raw;
    try {
      const u = new URL(normalized);
      const key = u.href.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        urls.push(u.href);
      }
    } catch {
      if (!seen.has(raw.toLowerCase())) {
        seen.add(raw.toLowerCase());
        urls.push(raw);
      }
    }
  }
  return urls;
}

/**
 * Normalize text for matching: collapse whitespace, trim.
 */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Get risk level from score (0-100).
 * 0-20: low, 21-50: medium, 51-75: high, 76-100: critical
 */
export function scoreToRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s <= 20) return 'low';
  if (s <= 50) return 'medium';
  if (s <= 75) return 'high';
  return 'critical';
}

/**
 * Cap a weighted contribution by a max value and sum (for weighted scoring).
 */
export function clampWeight(weight: number, max: number): number {
  return Math.min(max, Math.max(0, weight));
}

/**
 * Parse hostname from URL string; return null if invalid.
 */
export function getHostname(urlStr: string): string | null {
  try {
    const u = new URL(urlStr.startsWith('http') ? urlStr : 'https://' + urlStr);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Count subdomains (e.g. a.b.example.com -> 2: a, b).
 */
export function countSubdomains(hostname: string): number {
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length <= 2) return 0;
  return parts.length - 2;
}

/**
 * Check if domain looks like a known brand with character substitution (e.g. micros0ft, g00gle).
 */
export function getBrandLookalike(hostname: string, brands: readonly string[]): string | null {
  const lower = hostname.toLowerCase();
  for (const brand of brands) {
    if (lower.includes(brand)) continue;
    const fuzzy = brand
      .replace(/o/g, '[o0]')
      .replace(/l/g, '[l1|i]')
      .replace(/i/g, '[i1l]')
      .replace(/s/g, '[s5$]')
      .replace(/a/g, '[a4@]')
      .replace(/e/g, '[e3]')
      .replace(/m/g, '(m|rn|nn)')
      .replace(/n/g, '(n|rn)');
    const re = new RegExp(fuzzy, 'i');
    if (re.test(lower)) return brand;
  }
  return null;
}

/**
 * Simple lookalike check: common substitutions (0/O, 1/l, rn/m, etc.).
 */
export function hasLookalikeCharacters(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (/\d/.test(lower) && /[a-z]/.test(lower)) {
    if (/[0o]/.test(lower) || /[1li]/.test(lower) || /rn/.test(lower)) return true;
  }
  return false;
}
