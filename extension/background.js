// AI Scam Detector - Background Script

let debugLogs = [];
const MAX_LOGS = 500;

const EMAIL_DOMAINS = [
  'mail.google.com',
  'outlook.office.com',
  'outlook.live.com',
  'outlook.office365.com',
  'outlook.cloud.microsoft',
];

function isEmailUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return EMAIL_DOMAINS.some(function(d) {
    return lower.includes(d) || lower.endsWith('.' + d);
  });
}

function reportTabStateToApp(tab) {
  if (!tab || !tab.url) return;
  const isEmail = isEmailUrl(tab.url);
  fetch('http://127.0.0.1:8765/tab-state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: tab.url, isEmail: isEmail })
  }).catch(function() {});
}

function updateActiveTabState() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const tab = tabs[0];
    if (!tab || !tab.url) return;
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;
    reportTabStateToApp(tab);
    if (!isEmailUrl(tab.url)) {
      chrome.storage.local.set({ lastScanResult: null }).catch(function() {});
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  updateActiveTabState();
});

chrome.tabs.onActivated.addListener(function() {
  updateActiveTabState();
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateActiveTabState();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // CRITICAL: Handle logDebug from content script
  if (message.action === 'logDebug') {
    const entry = message.entry || {
      timestamp: message.timestamp,
      level: message.level,
      message: message.message,
      data: message.data,
      url: message.url
    };

    debugLogs.push(entry);
    if (debugLogs.length > MAX_LOGS) {
      debugLogs = debugLogs.slice(-MAX_LOGS);
    }

    // Store to chrome.storage.local
    chrome.storage.local.set({ debugLogs: debugLogs }).catch(() => {});
    return false;
  }

  // MAIL_DETECTED: sent once per URL change from content script (not on scroll/mouse)
  if (message.action === 'MAIL_DETECTED') {
    const url = message.url || '';
    if (url) reportTabStateToApp({ url: url });
    return false;
  }

  // DATA_RECORDED: extension read email content; forward to Electron (localhost server) and update overlay debug log
  if (message.type === 'DATA_RECORDED' && message.payload) {
    const payload = message.payload;
    fetch('http://127.0.0.1:8765/data-recorded', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: payload.url,
        length: payload.length,
        timestamp: payload.timestamp,
        content: payload.content || undefined
      })
    }).catch(function() {});
    return false;
  }

  // SCAN_LINKS_REQUEST: content script sends urls + optional pageText; we call app link scanner and boost risk for email-body phishing phrases
  if (message.action === 'SCAN_LINKS_REQUEST') {
    const urls = message.urls || [];
    const pageUrl = message.pageUrl || '';
    const pageText = (message.pageText || '').toLowerCase();
    fetch('http://127.0.0.1:8765/scan-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: urls })
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        const results = data.results || [];
        let maxRisk = results.length ? Math.max(...results.map(function(r) { return r.riskScore || 0; })) : 0;
        var urlsWithFindings = results.filter(function(r) { return (r.riskScore || 0) >= 20; }).length;
        if (urlsWithFindings >= 2 && maxRisk >= 25) {
          maxRisk = Math.max(maxRisk, 50);
        }
        var redFlags = [];
        results.forEach(function(r) {
          if (!r.explanation || r.explanation === 'No issues identified.') return;
          redFlags.push(r.explanation);
        });
        var contentBoost = 0;
        var hasFakeProvider = /\b(zmail|0utlook|out1ook|outlok|gmai1|grnail|gnail|gmal|gmali|gmaill|gmeil|yah00|hotmali)\b/.test(pageText);
        var hasExpiredReactivate = /\b(expired|reactivate|account\s+.*\s+expired|services?\s+has\s+expired|account\s+services?\s+has\s+expired)\b/.test(pageText);
        if (hasFakeProvider || hasExpiredReactivate) {
          contentBoost = 35;
          if (hasFakeProvider && hasExpiredReactivate) contentBoost = 45;
          redFlags.push('Detected: Email mentions fake provider (e.g. Zmail, 0utlook) or account expired/reactivate language. Threat categories: phishing.');
        }
        maxRisk = Math.min(100, maxRisk + contentBoost);
        if (contentBoost > 0 && maxRisk < 50) maxRisk = 55;
        const warning = maxRisk >= 50;
        const lastScanResult = {
          pageUrl: pageUrl,
          warning: warning,
          maxRisk: maxRisk,
          redFlags: redFlags,
          results: results,
          appReachable: true,
          timestamp: Date.now()
        };
        chrome.storage.local.set({ lastScanResult: lastScanResult });
        sendResponse(lastScanResult);
      })
      .catch(function() {
        const fallback = { pageUrl: pageUrl, warning: false, maxRisk: 0, redFlags: [], results: [], appReachable: false, timestamp: Date.now() };
        chrome.storage.local.set({ lastScanResult: fallback });
        sendResponse(fallback);
      });
    return true;
  }

  // Handle log retrieval
  if (message.action === 'getDebugLogs') {
    chrome.storage.local.get('debugLogs').then(stored => {
      if (stored.debugLogs && stored.debugLogs.length > 0) {
        debugLogs = stored.debugLogs;
      }
      sendResponse(debugLogs);
    });
    return true;
  }

  // Handle clear
  if (message.action === 'clearDebugLogs') {
    debugLogs = [];
    chrome.storage.local.set({ debugLogs: [] });
    sendResponse({ success: true });
    return false;
  }

  return false;
});
