document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const toggleBtn = document.getElementById('toggleLogs');
  const clearBtn = document.getElementById('clearLogs');
  const logViewer = document.getElementById('logViewer');
  const logCountEl = document.getElementById('logCount');
  const toggleContentBtn = document.getElementById('toggleContent');
  const contentViewer = document.getElementById('contentViewer');
  const scanRiskEl = document.getElementById('scanRisk');
  const scanRedFlagsEl = document.getElementById('scanRedFlags');
  const reportBtn = document.getElementById('reportBtn');
  const reportStatusEl = document.getElementById('reportStatus');

  // Load and show latest scan result (risk score, red flags)
  const { lastScanResult } = await chrome.storage.local.get('lastScanResult');
  if (lastScanResult) {
    scanRiskEl.textContent = 'Risk score: ' + (lastScanResult.maxRisk != null ? lastScanResult.maxRisk : '—');
    if (lastScanResult.appReachable === false) {
      scanRiskEl.textContent += ' (app not running)';
    }
    const flags = lastScanResult.redFlags || [];
    scanRedFlagsEl.innerHTML = flags.length ? '<strong>Red flags:</strong><ul style="margin:4px 0 0; padding-left:16px;">' + flags.map(f => '<li>' + String(f).replace(/</g, '&lt;').substring(0, 120) + '</li>').join('') + '</ul>' : 'None identified';
  } else {
    scanRedFlagsEl.textContent = 'No scan yet. Open an email in Gmail or Outlook.';
  }

  // Report button: save to local file (download + send to app)
  if (reportBtn && reportStatusEl) {
    reportBtn.addEventListener('click', async () => {
      const { lastScanResult: r } = await chrome.storage.local.get('lastScanResult');
      if (!r) {
        reportStatusEl.textContent = 'No scan data to report.';
        return;
      }
      const report = {
        pageUrl: r.pageUrl,
        maxRisk: r.maxRisk,
        warning: r.warning,
        redFlags: r.redFlags || [],
        results: (r.results || []).map(x => ({ url: x.url, riskScore: x.riskScore, explanation: x.explanation })),
        timestamp: r.timestamp,
        reportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'scamshield-report-' + Date.now() + '.json';
      a.click();
      URL.revokeObjectURL(url);
      try {
        const res = await fetch('http://127.0.0.1:8765/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report),
        });
        if (res && res.ok) {
          reportStatusEl.textContent = 'Saved to app reports file and downloaded.';
        } else {
          reportStatusEl.textContent = 'Downloaded. (App not running to save to file.)';
        }
      } catch (e) {
        reportStatusEl.textContent = 'Downloaded. (App not running to save to file.)';
      }
    });
  }

  // Check current tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const allowedDomains = ['mail.google.com', 'outlook.office.com', 'outlook.live.com', 'outlook.office365.com', 'outlook.cloud.microsoft'];
      const isAllowed = allowedDomains.some(domain => tab.url.includes(domain));
      statusEl.textContent = isAllowed ? '✓ Active on this page' : '✗ Not active (visit Gmail/Outlook)';
      statusEl.className = 'status ' + (isAllowed ? 'active' : 'inactive');
    }
  } catch (e) {}

  // Update log count
  async function updateLogCount() {
    const stored = await chrome.storage.local.get('debugLogs');
    logCountEl.textContent = `${(stored.debugLogs || []).length} log entries`;
  }
  updateLogCount();

  // Toggle logs
  let logsVisible = false;
  toggleBtn.addEventListener('click', async () => {
    if (!logsVisible) {
      const stored = await chrome.storage.local.get('debugLogs');
      const logs = stored.debugLogs || [];
      logViewer.innerHTML = logs.length === 0 ? '<div style="color:#888;">No logs yet</div>' :
        logs.map(e => `<div class="log-entry"><span class="log-time">[${e.timestamp?.split('T')[1]?.split('.')[0]}]</span> <span class="log-${e.level?.toLowerCase()}">${e.level}</span> ${e.message}</div>`).join('');
      logViewer.classList.add('show');
      toggleBtn.textContent = 'Hide Debug Logs';
      logsVisible = true;
    } else {
      logViewer.classList.remove('show');
      toggleBtn.textContent = 'Show Debug Logs';
      logsVisible = false;
    }
  });

  if (toggleContentBtn && contentViewer) {
    let contentVisible = false;
    toggleContentBtn.addEventListener('click', async () => {
      if (!contentVisible) {
        const stored = await chrome.storage.local.get(['lastPageContent', 'lastPageContentUrl', 'lastPageContentTime']);
        const content = stored.lastPageContent || '';
        const url = stored.lastPageContentUrl || '';
        const time = stored.lastPageContentTime ? new Date(stored.lastPageContentTime).toISOString() : '';
        if (!content) {
          contentViewer.innerHTML = '<div style="color:#888;">No page content captured yet. Open an email in Gmail or Outlook.</div>';
        } else {
          const safe = content.replace(/</g, '&lt;').substring(0, 15000);
          contentViewer.innerHTML = '<div class="content-meta">' + (url ? 'URL: ' + url.substring(0, 80) + '<br>' : '') + (time ? 'At: ' + time + '</div>' : '') + '<pre class="content-text">' + safe + (content.length > 15000 ? '\n...[truncated]' : '') + '</pre>';
        }
        contentViewer.classList.add('show');
        toggleContentBtn.textContent = 'Hide last page content';
        contentVisible = true;
      } else {
        contentViewer.classList.remove('show');
        toggleContentBtn.textContent = 'Show last page content';
        contentVisible = false;
      }
    });
  }

  // Clear logs
  clearBtn.addEventListener('click', async () => {
    if (!confirm('Clear all debug logs?')) return;
    await chrome.storage.local.set({ debugLogs: [] });
    updateLogCount();
    clearBtn.textContent = 'Cleared!';
    setTimeout(() => clearBtn.textContent = 'Clear Logs', 1500);
  });
});
