document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const toggleBtn = document.getElementById('toggleLogs');
  const clearBtn = document.getElementById('clearLogs');
  const logViewer = document.getElementById('logViewer');
  const logCountEl = document.getElementById('logCount');
  const toggleContentBtn = document.getElementById('toggleContent');
  const contentViewer = document.getElementById('contentViewer');

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
