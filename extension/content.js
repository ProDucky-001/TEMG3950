// ScamShield - Content Script
// Runs on all pages: logs active, extracts links. Full scan/overlay only on Gmail/Outlook.

(function() {
  'use strict';

  console.log('[ScamShield] Active');

  function extractLinks() {
    const links = document.querySelectorAll('a[href]');
    const results = [];
    links.forEach(function(link) {
      results.push({
        href: link.href,
        text: (link.innerText || link.textContent || '').trim().substring(0, 50),
        element: link
      });
    });
    console.log('[ScamShield] Found links:', results.length);
    return results;
  }

  // Run on page load and log links
  var initialLinks = extractLinks();

  if (window.__scamDetectorInitialized__) return;
  window.__scamDetectorInitialized__ = true;

  const CONFIG = {
    ALLOWED_DOMAINS: [
      'mail.google.com',
      'outlook.office.com',
      'outlook.live.com',
      'outlook.office365.com',
      'outlook.cloud.microsoft',
    ],
    DEBOUNCE_DELAY: 100,
    SCAN_DELAY: 200,
  };

  const state = {
    isScanning: false,
    currentResult: null,
    lastUrl: null,
    hasScanned: false,
    /** Only send MAIL_DETECTED once per URL (not on scroll/mouse). */
    lastNotifiedUrl: null,
  };

  // CRITICAL FIX: Send logs via messaging, NOT directly to chrome.storage
  const DebugLogger = {
    log(level, message, data) {
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        data: data ? JSON.stringify(data).substring(0, 500) : null,
        url: window.location.href.substring(0, 100),
      };

      // CRITICAL: Send to background via chrome.runtime.sendMessage
      try {
        chrome.runtime.sendMessage({
          action: 'logDebug',
          entry: entry
        }, () => {});
      } catch (e) {}
    },
    info(msg, data) { this.log('INFO', msg, data); },
    error(msg, data) { this.log('ERROR', msg, data); },
    warn(msg, data) { this.log('WARN', msg, data); },
  };

  function isAllowedDomain() {
    const hostname = window.location.hostname;
    return CONFIG.ALLOWED_DOMAINS.some(function(d) { return hostname === d || hostname.endsWith('.' + d); });
  }

  function getPageText() {
    const emailBodyEl = document.querySelector('.view-content, .MessageBody, .a3s.aiL');
    const text = emailBodyEl ? (emailBodyEl.innerText || emailBodyEl.textContent || '') : '';
    return (text || '').trim();
  }

  function dedupeLines(str) {
    if (!str) return '';
    const lines = str.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
    const seen = {};
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (seen[lines[i]]) continue;
      seen[lines[i]] = true;
      out.push(lines[i]);
    }
    return out.join('\n');
  }

  function captureEmailData() {
    const emailBody = getPageText();
    if (emailBody && emailBody.length > 0) {
      const deduped = dedupeLines(emailBody);
      try {
        chrome.storage.local.set({
          lastPageContent: deduped,
          lastPageContentUrl: window.location.href,
          lastPageContentTime: Date.now()
        });
        chrome.runtime.sendMessage({
          type: 'DATA_RECORDED',
          payload: {
            url: window.location.href,
            length: emailBody.length,
            timestamp: Date.now(),
            content: deduped
          }
        }, function() {});
      } catch (e) {}
    }
  }

  const LinkAnalyzer = {
    phishingPatterns: [
      /login|signin|verify|account.*update|security.*alert/i,
      /password.*reset|bank.*verify|urgent.*action/i,
      /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
      /bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly/i,
    ],
    suspiciousTLDs: ['.xyz', '.top', '.club', '.win', '.info', '.tk', '.ml', '.ga', '.cf', '.gq'],

    analyzeLink(href, text) {
      if (!href) return { suspicious: false, riskScore: 0, reasons: [] };
      const reasons = [];
      const lowerHref = href.toLowerCase();

      for (const pattern of this.phishingPatterns) {
        if (pattern.test(lowerHref)) {
          reasons.push('phishing_pattern');
          break;
        }
      }
      for (const tld of this.suspiciousTLDs) {
        if (lowerHref.includes(tld)) {
          reasons.push('suspicious_tld');
          break;
        }
      }
      try {
        const parts = new URL(href).hostname.split('.');
        if (parts.length > 4) reasons.push('excessive_subdomains');
      } catch (e) {}

      return { suspicious: reasons.length > 0, riskScore: Math.min(reasons.length * 0.35, 1.0), reasons };
    },
  };

  // CRITICAL FIX: Use plain DOM elements, NOT Shadow DOM
  const Overlay = {
    element: null,
    created: false,

    create() {
      if (this.created && this.element) return;

      this.element = document.createElement('div');
      this.element.id = 'scam-detector-overlay';

      // CRITICAL: Use inline styles with !important for guaranteed positioning
      this.element.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        margin: 0 !important;
        padding: 0 !important;
      `;

      // Create badge
      const badge = document.createElement('div');
      badge.id = 'scam-detector-badge';
      badge.style.cssText = `
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        padding: 12px 20px !important;
        background: white !important;
        border-radius: 8px !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
        font-size: 14px !important;
        font-weight: 600 !important;
        z-index: 2147483648 !important;
        pointer-events: auto !important;
        display: none !important;
      `;
      badge.textContent = 'Initializing...';

      // Create indicator
      const indicator = document.createElement('div');
      indicator.id = 'scam-detector-indicator';
      indicator.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        pointer-events: none !important;
        border: 4px solid transparent !important;
        box-sizing: border-box !important;
      `;

      this.element.appendChild(indicator);
      this.element.appendChild(badge);

      // CRITICAL: Insert as FIRST child of body
      if (document.body) {
        document.body.insertBefore(this.element, document.body.firstChild);
      }

      this.created = true;
      DebugLogger.info('Overlay created');
    },

    show(status) {
      if (!this.element) this.create();
      const badge = this.element.querySelector('#scam-detector-badge');
      const indicator = this.element.querySelector('#scam-detector-indicator');
      if (!badge || !indicator) return;

      badge.style.display = 'block';

      if (status === 'scanning') {
        badge.style.color = '#6b7280';
        badge.style.borderLeft = '4px solid #6b7280';
        badge.textContent = 'Scanning...';
        indicator.style.borderColor = 'rgba(128, 128, 128, 0.5)';
        indicator.style.backgroundColor = 'rgba(128, 128, 128, 0.1)';
      } else if (status === 'safe') {
        badge.style.color = '#10b981';
        badge.style.borderLeft = '4px solid #10b981';
        badge.textContent = '✓ Safe';
        indicator.style.borderColor = 'rgba(34, 197, 94, 0.6)';
        indicator.style.backgroundColor = 'rgba(34, 197, 94, 0.08)';
      } else if (status === 'suspicious') {
        badge.style.color = '#ef4444';
        badge.style.borderLeft = '4px solid #ef4444';
        badge.textContent = '⚠ Warning';
        indicator.style.borderColor = 'rgba(239, 68, 68, 0.6)';
        indicator.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
      }
    },
  };

  function performInstantAnalysis() {
    const links = document.querySelectorAll('a[href]');
    let maxRisk = 0;
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        const result = LinkAnalyzer.analyzeLink(href, link.textContent);
        maxRisk = Math.max(maxRisk, result.riskScore);
      }
    });
    return maxRisk;
  }

  async function performScan() {
    if (state.isScanning) return;

    const currentUrl = window.location.href;

    // CRITICAL: Check cache BEFORE starting new scan
    if (state.currentResult && state.lastUrl === currentUrl && state.hasScanned) {
      updateUI(state.currentResult);
      return;
    }

    state.isScanning = true;
    state.lastUrl = currentUrl;
    Overlay.show('scanning');

    try {
      // Instant local analysis
      const instantRisk = performInstantAnalysis();

      // Show suspicious immediately if risk is high
      if (instantRisk > 0.7) {
        const result = { suspicious: true, riskScore: instantRisk, timestamp: Date.now() };
        state.currentResult = result;
        state.hasScanned = true;
        updateUI(result);
        state.isScanning = false;
        return;
      }

      // Get content for scam phrase check (Gmail and Outlook)
      let content = '';
      if (window.location.hostname === 'mail.google.com') {
        const el = document.querySelector('.a3s.aiL');
        if (el) content = el.textContent || '';
      } else {
        const outlookEl = document.querySelector('.view-content, .MessageBody');
        if (outlookEl) content = (outlookEl.innerText || outlookEl.textContent || '').trim();
      }

      captureEmailData();

      // Check scam phrases
      const scamPhrases = ['urgent action required', 'verify your account', 'password reset'];
      const contentLower = content.toLowerCase();
      let phraseRisk = 0;
      for (const phrase of scamPhrases) {
        if (contentLower.includes(phrase)) { phraseRisk = 0.3; break; }
      }

      const totalRisk = Math.min(instantRisk + phraseRisk, 1.0);
      const result = { suspicious: totalRisk > 0.5, riskScore: totalRisk, timestamp: Date.now() };

      state.currentResult = result;
      state.hasScanned = true;
      updateUI(result);

    } catch (error) {
      DebugLogger.error('Scan failed', { error: error.message });
    } finally {
      state.isScanning = false;
    }
  }

  function updateUI(result) {
    Overlay.show(result.suspicious ? 'suspicious' : 'safe');
    const currentUrl = window.location.href;
    if (currentUrl !== state.lastNotifiedUrl) {
      state.lastNotifiedUrl = currentUrl;
      try {
        chrome.runtime.sendMessage({ action: 'MAIL_DETECTED', url: currentUrl }, function() {});
      } catch (e) {}
    }
  }

  function init() {
    if (!isAllowedDomain()) return;
    DebugLogger.info('Initializing');

    Overlay.create();
    state.lastUrl = window.location.href;
    performScan();

    // CRITICAL FIX: Only restore from cache, don't rescan
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (state.lastUrl === window.location.href && state.currentResult) {
          updateUI(state.currentResult);
        } else {
          state.lastUrl = window.location.href;
          state.currentResult = null;
          state.hasScanned = false;
          state.lastNotifiedUrl = null;
          performScan();
        }
      }
    });

    // Handle SPA navigation: only run scan when URL actually changes (not on scroll/mouse).
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        state.lastUrl = url;
        state.currentResult = null;
        state.hasScanned = false;
        state.lastNotifiedUrl = null;
        performScan();
      }
    }).observe(document.body, { subtree: true, childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
