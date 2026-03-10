/**
 * Low-latency local link analyzer (<50ms). Cached by URL.
 */
(function (global) {
  const SUSPICIOUS_TLDS = ['.xyz', '.top', '.club', '.win', '.info', '.tk', '.ml', '.ga', '.cf', '.gq', '.php'];
  const PHISHING_PATTERNS = [
    /login|signin|verify|account.*update|security.*alert/i,
    /password.*reset|bank.*verify|urgent.*action/i,
    /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
    /bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|is\.gd|cutt\.ly/i
  ];
  const CACHE_MAX = 500;
  const cache = new Map();

  function analyzeLink(href, text) {
    if (!href || typeof href !== 'string') return { suspicious: false, score: 0, riskScore: 0 };
    const key = href.trim().toLowerCase();
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    let score = 0;
    const lower = key;

    for (const pattern of PHISHING_PATTERNS) {
      if (pattern.test(lower)) { score += 0.3; break; }
    }
    if (text && typeof text === 'string') {
      const t = text.toLowerCase();
      for (const pattern of PHISHING_PATTERNS) {
        if (pattern.test(t)) { score += 0.2; break; }
      }
    }
    for (const tld of SUSPICIOUS_TLDS) {
      if (lower.includes(tld)) { score += 0.2; break; }
    }
    try {
      const parts = new URL(href).hostname.split('.');
      if (parts.length > 4) score += 0.1;
    } catch (e) {}

    const result = { suspicious: score > 0.3, score: Math.min(score, 1.0), riskScore: Math.min(score, 1.0) };
    cache.set(key, result);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return result;
  }

  global.LinkAnalyzer = { analyzeLink };
})(typeof self !== 'undefined' ? self : this);
