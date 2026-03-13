// ScamShield - Content Script
// Runs on all pages: logs active, extracts links. Full scan/overlay only on Gmail/Outlook.

(function() {
  'use strict';

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

  /** Send message to background; swallows promise rejection when extension context is invalidated. */
  function safeSendMessage(msg, callback) {
    try {
      var p = chrome.runtime.sendMessage(msg, callback || function() {});
      if (p && typeof p.catch === 'function') p.catch(function() {});
    } catch (e) {}
  }

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
        safeSendMessage({ action: 'logDebug', entry: entry });
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

  /** True when viewing a single email (not inbox/home list). Avoids showing popup on inbox. */
  function isMessageViewUrl(url) {
    if (!url || !isAllowedDomain()) return false;
    var u = url.toLowerCase();
    try {
      if (u.includes('mail.google.com') || u.includes('gmail.com')) {
        var hash = (url.split('#')[1] || '').trim();
        var parts = hash.split('/').filter(Boolean);
        return parts[0] === 'inbox' && parts.length >= 2;
      }
      if (u.includes('outlook.') || u.includes('office365') || u.includes('live.com')) {
        var path = (url.split('?')[0] || '').toLowerCase();
        return path.indexOf('/read/') !== -1 || path.indexOf('/message/') !== -1 || path.indexOf('/messages/') !== -1;
      }
    } catch (e) {}
    return false;
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
        safeSendMessage({
          type: 'DATA_RECORDED',
          payload: {
            url: window.location.href,
            length: emailBody.length,
            timestamp: Date.now(),
            content: deduped
          }
        });
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

  function getLinksForScan() {
    const links = document.querySelectorAll('a[href]');
    const seen = {};
    const urls = [];
    links.forEach(function(link) {
      const href = link.getAttribute('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://')) && !seen[href]) {
        seen[href] = true;
        urls.push(href);
      }
    });
    return urls;
  }

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

      // Badge (safe/scanning only – warning uses popup)
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
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        font-size: 14px !important;
        font-weight: 600 !important;
        z-index: 2147483648 !important;
        pointer-events: auto !important;
        display: none !important;
      `;
      badge.textContent = 'Initializing...';

      // Mini warning popup (same data as extension: risk score + red flags)
      const popup = document.createElement('div');
      popup.id = 'scam-detector-warning-popup';
      popup.style.cssText = `
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        width: 360px !important;
        max-width: calc(100vw - 40px) !important;
        max-height: 80vh !important;
        overflow: hidden !important;
        background: #fff !important;
        border-radius: 12px !important;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.06) !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        z-index: 2147483649 !important;
        pointer-events: auto !important;
        display: none !important;
        flex-direction: column !important;
      `;

      const popupHeader = document.createElement('div');
      popupHeader.style.cssText = `
        padding: 14px 16px !important;
        background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%) !important;
        border-bottom: 1px solid #fecaca !important;
        border-radius: 12px 12px 0 0 !important;
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
      `;
      popupHeader.innerHTML = `
        <span style="font-size:20px;line-height:1;">⚠</span>
        <div>
          <div style="font-weight:700;font-size:15px;color:#991b1b;">Suspicious links detected</div>
          <div style="font-size:12px;color:#b91c1c;margin-top:2px;">ScamShield</div>
        </div>
      `;

      const popupBody = document.createElement('div');
      popupBody.id = 'scam-detector-popup-body';
      popupBody.style.cssText = `
        padding: 14px 16px !important;
        overflow-y: auto !important;
        max-height: 320px !important;
        font-size: 13px !important;
        color: #374151 !important;
        line-height: 1.45 !important;
      `;

      const popupScore = document.createElement('div');
      popupScore.id = 'scam-detector-popup-score';
      popupScore.style.cssText = `
        font-weight: 600 !important;
        color: #1f2937 !important;
        margin-bottom: 10px !important;
        padding-bottom: 10px !important;
        border-bottom: 1px solid #e5e7eb !important;
      `;

      const popupFlags = document.createElement('div');
      popupFlags.id = 'scam-detector-popup-flags';
      popupFlags.style.cssText = `
        margin: 0 !important;
        padding-left: 18px !important;
      `;
      popupFlags.innerHTML = '<div style="font-weight:600;color:#6b7280;margin-bottom:6px;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Red flags</div>';

      const popupList = document.createElement('ul');
      popupList.id = 'scam-detector-popup-list';
      popupList.style.cssText = `
        margin: 0 0 12px 0 !important;
        padding-left: 18px !important;
        font-size: 12px !important;
        color: #4b5563 !important;
      `;

      const popupFooter = document.createElement('div');
      popupFooter.style.cssText = `
        padding: 10px 16px 14px !important;
        border-top: 1px solid #e5e7eb !important;
        background: #fafafa !important;
        border-radius: 0 0 12px 12px !important;
      `;
      const dismissBtn = document.createElement('button');
      dismissBtn.id = 'scam-detector-popup-dismiss';
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.style.cssText = `
        width: 100% !important;
        padding: 8px 14px !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        font-family: inherit !important;
        color: #374151 !important;
        background: #fff !important;
        border: 1px solid #d1d5db !important;
        border-radius: 8px !important;
        cursor: pointer !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
      `;
      dismissBtn.addEventListener('mouseenter', function() {
        dismissBtn.style.background = '#f3f4f6';
        dismissBtn.style.borderColor = '#9ca3af';
      });
      dismissBtn.addEventListener('mouseleave', function() {
        dismissBtn.style.background = '#fff';
        dismissBtn.style.borderColor = '#d1d5db';
      });
      dismissBtn.addEventListener('click', function() {
        popup.style.display = 'none';
        if (Overlay.element) {
          var badge = Overlay.element.querySelector('#scam-detector-badge');
          var ind = Overlay.element.querySelector('#scam-detector-indicator');
          if (badge) {
            badge.style.display = 'block';
            badge.style.color = '#ef4444';
            badge.style.borderLeft = '4px solid #ef4444';
            badge.textContent = '⚠ Warning';
          }
          if (ind) {
            ind.style.borderColor = 'rgba(239, 68, 68, 0.6)';
            ind.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
          }
        }
      });
      popupFooter.appendChild(dismissBtn);

      popupBody.appendChild(popupScore);
      popupFlags.appendChild(popupList);
      popupBody.appendChild(popupFlags);
      popup.appendChild(popupHeader);
      popup.appendChild(popupBody);
      popup.appendChild(popupFooter);

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
      this.element.appendChild(popup);

      // CRITICAL: Insert as FIRST child of body
      if (document.body) {
        document.body.insertBefore(this.element, document.body.firstChild);
      }

      this.created = true;
      DebugLogger.info('Overlay created');
    },

    show(status, result) {
      if (!this.element) this.create();
      const badge = this.element.querySelector('#scam-detector-badge');
      const popup = this.element.querySelector('#scam-detector-warning-popup');
      const indicator = this.element.querySelector('#scam-detector-indicator');
      if (!badge || !indicator) return;

      if (status === 'suspicious' && result && (result.redFlags || result.riskScore != null)) {
        indicator.style.borderColor = 'rgba(239, 68, 68, 0.6)';
        indicator.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
        var onMessageView = isMessageViewUrl(window.location.href);
        if (onMessageView && popup) {
          badge.style.display = 'none';
          var scoreEl = this.element.querySelector('#scam-detector-popup-score');
          var listEl = this.element.querySelector('#scam-detector-popup-list');
          if (scoreEl) scoreEl.textContent = 'Risk score: ' + (result.riskScore != null ? result.riskScore : '—');
          if (listEl) {
            var flags = result.redFlags || [];
            listEl.innerHTML = flags.length
              ? flags.map(function(f) {
                  var t = String(f).replace(/</g, '&lt;').substring(0, 200);
                  return '<li style="margin-bottom:6px;">' + t + '</li>';
                }).join('')
              : '<li style="color:#9ca3af;">None listed</li>';
          }
          popup.style.display = 'flex';
        } else {
          if (popup) popup.style.display = 'none';
          badge.style.display = 'block';
          badge.style.color = '#ef4444';
          badge.style.borderLeft = '4px solid #ef4444';
          badge.textContent = '⚠ Warning';
        }
        return;
      }

      if (popup) popup.style.display = 'none';
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

    if (state.currentResult && state.lastUrl === currentUrl && state.hasScanned) {
      updateUI(state.currentResult);
      return;
    }

    state.isScanning = true;
    state.lastUrl = currentUrl;
    Overlay.show('scanning');

    captureEmailData();

    const urls = getLinksForScan();
    const pageText = getPageText();
    const scanPayload = { action: 'SCAN_LINKS_REQUEST', urls: urls, pageUrl: currentUrl, pageText: pageText || '' };
    const onResponse = function(response) {
      try {
        if (!chrome || !chrome.runtime || typeof chrome.runtime.id !== 'string') return;
        var s = state;
        s.isScanning = false;
        if (!response) {
          s.currentResult = { suspicious: false, riskScore: 0, timestamp: Date.now(), appReachable: false };
          s.hasScanned = true;
          Overlay.show('safe');
          DebugLogger.warn('Scan: no response from background');
          return;
        }
        var warning = response.appReachable && response.warning === true;
        s.currentResult = {
          suspicious: warning,
          riskScore: response.maxRisk || 0,
          timestamp: response.timestamp || Date.now(),
          appReachable: response.appReachable,
          redFlags: response.redFlags || [],
          results: response.results || [],
        };
        s.hasScanned = true;
        if (warning) {
          Overlay.show('suspicious', {
            riskScore: response.maxRisk,
            redFlags: response.redFlags || [],
          });
          DebugLogger.info('Scan: app flagged risk', { maxRisk: response.maxRisk, redFlags: response.redFlags });
        } else {
          Overlay.show('safe');
          if (!response.appReachable) DebugLogger.warn('Scan: app not reachable, showing Safe');
        }
        var pageUrl = window.location.href;
        if (pageUrl !== s.lastNotifiedUrl) {
          s.lastNotifiedUrl = pageUrl;
            try {
              safeSendMessage({ action: 'MAIL_DETECTED', url: pageUrl });
            } catch (e) {}
        }
      } catch (e) {
        /* Callback ran after context invalidated or page unload */
      }
    };
    safeSendMessage(scanPayload, onResponse);
  }

  function updateUI(result) {
    if (result.suspicious) {
      Overlay.show('suspicious', { riskScore: result.riskScore, redFlags: result.redFlags || [] });
    } else {
      Overlay.show('safe');
    }
    const currentUrl = window.location.href;
    if (currentUrl !== state.lastNotifiedUrl) {
      state.lastNotifiedUrl = currentUrl;
      try {
        safeSendMessage({ action: 'MAIL_DETECTED', url: currentUrl });
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
