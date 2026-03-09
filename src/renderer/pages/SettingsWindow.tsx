import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Settings } from '../../shared/types'
import '../styles/settings.css'

type SettingsTab = 'general' | 'monitoring' | 'alerts' | 'privacy' | 'about'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'about', label: 'About' },
]

export default function SettingsWindow() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [dashboardAlwaysOnTop, setDashboardAlwaysOnTopState] = useState(false)
  const [usageStatsOptIn, setUsageStatsOptInState] = useState(false)
  const [screenCaptureStatus, setScreenCaptureStatus] = useState<'granted' | 'denied' | 'unknown'>('unknown')
  const [screenCaptureInstructions, setScreenCaptureInstructions] = useState<{ platform: string; steps: string } | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('monitoring')

  useEffect(() => {
    if (window.scamshield) {
      window.scamshield.getSettings().then(setSettings)
      window.scamshield.getDashboardAlwaysOnTop?.().then(setDashboardAlwaysOnTopState)
      window.scamshield.getUsageStatsOptIn?.().then(setUsageStatsOptInState)
      window.scamshield.getScreenCaptureStatus?.().then((r: { status: 'granted' | 'denied' | 'unknown' }) => setScreenCaptureStatus(r?.status ?? 'unknown'))
      window.scamshield.getScreenCaptureInstructions?.().then(setScreenCaptureInstructions)
    }
  }, [])

  async function updateSetting<K extends keyof Settings>(
    key: K,
    value: Settings[K]
  ) {
    if (!window.scamshield || !settings) return
    const updated = await window.scamshield.updateSettings({ [key]: value })
    setSettings(updated)
  }

  async function toggleApp(appId: string) {
    if (!settings) return
    const apps = settings.monitoredApps.map((app) =>
      app.id === appId ? { ...app, enabled: !app.enabled } : app
    )
    await updateSetting('monitoredApps', apps)
  }

  async function toggleLaunchAtStartup() {
    const enabled = !settings?.launchAtStartup
    if (window.scamshield) {
      await window.scamshield.setLaunchAtStartup(enabled)
      await updateSetting('launchAtStartup', enabled)
    }
  }

  if (!settings) {
    return (
      <div className="settings-loading">
        <p>Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="settings" role="application" aria-label="Settings">
      <header className="settings-header">
        <Link to="/" className="back-link">
          ← Dashboard
        </Link>
        <h1>Settings</h1>
      </header>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="settings-content">
        {/* General */}
        <section
          id="panel-general"
          role="tabpanel"
          aria-labelledby="tab-general"
          hidden={activeTab !== 'general'}
          className="settings-panel"
        >
          <h2>General</h2>
          <label className="toggle-row">
            <span>Launch at startup</span>
            <input
              type="checkbox"
              checked={settings.launchAtStartup}
              onChange={toggleLaunchAtStartup}
            />
          </label>
          <label className="toggle-row">
            <span>Start minimized to tray</span>
            <input
              type="checkbox"
              checked={settings.minimizeToTray}
              onChange={(e) =>
                updateSetting('minimizeToTray', e.target.checked)
              }
            />
          </label>
          <label className="toggle-row">
            <span>Close to tray (instead of quit)</span>
            <input
              type="checkbox"
              checked={settings.closeToTray}
              onChange={(e) =>
                updateSetting('closeToTray', e.target.checked)
              }
            />
          </label>
          <label className="toggle-row">
            <span>Dashboard always on top</span>
            <input
              type="checkbox"
              checked={dashboardAlwaysOnTop}
              onChange={async (e) => {
                const v = e.target.checked
                await window.scamshield?.setDashboardAlwaysOnTop?.(v)
                setDashboardAlwaysOnTopState(v)
              }}
            />
          </label>
          <div className="form-row">
            <label>Language</label>
            <select className="settings-select" disabled aria-describedby="lang-desc">
              <option value="en">English</option>
            </select>
            <p id="lang-desc" className="section-desc">More languages coming soon.</p>
          </div>
        </section>

        {/* Monitoring */}
        <section
          id="panel-monitoring"
          role="tabpanel"
          aria-labelledby="tab-monitoring"
          hidden={activeTab !== 'monitoring'}
          className="settings-panel"
        >
          <h2>Monitoring</h2>

          <h2 className="settings-subsection">Screen capture (email clients)</h2>
          <p className="section-desc">
            When you view Gmail, Outlook, or Apple Mail, ScamShield can capture and analyze visible content locally with OCR. Screenshots are never stored. A green corner indicator can show when recording is active.
          </p>
          <label className="toggle-row">
            <span>Enable screen capture when viewing email</span>
            <input
              type="checkbox"
              checked={settings.screenCaptureEnabled !== false}
              onChange={(e) =>
                updateSetting('screenCaptureEnabled', e.target.checked)
              }
            />
          </label>
          <label className="toggle-row">
            <span>Show green corner indicator when recording</span>
            <input
              type="checkbox"
              checked={settings.showRecordingIndicator !== false}
              onChange={(e) =>
                updateSetting('showRecordingIndicator', e.target.checked)
              }
            />
          </label>
          <div className="form-row">
            <label>Capture interval when email app is active (seconds)</label>
            <input
              type="number"
              min={2}
              max={30}
              value={Math.round((settings.screenCapturePollIntervalMs ?? 3000) / 1000)}
              onChange={(e) => {
                const sec = Math.max(2, Math.min(30, parseInt(String(e.target.value), 10) || 3))
                updateSetting('screenCapturePollIntervalMs', sec * 1000)
              }}
            />
          </div>
          {screenCaptureStatus === 'denied' && screenCaptureInstructions && (
            <div className="settings-notice" role="alert">
              <strong>Screen recording permission required</strong>
              <p>{screenCaptureInstructions.steps}</p>
              <p className="settings-notice-hint">Until then, only clipboard and browser URL monitoring are used.</p>
            </div>
          )}
          {screenCaptureStatus === 'granted' && (
            <p className="section-desc settings-success">Screen capture is active when an email client is in focus. Green corners appear when recording.</p>
          )}

          <h2 className="settings-subsection" style={{ marginTop: '24px' }}>General monitoring</h2>
          <label className="toggle-row">
            <span>Enable monitoring</span>
            <input
              type="checkbox"
              checked={settings.monitoringEnabled}
              onChange={(e) =>
                updateSetting('monitoringEnabled', e.target.checked)
              }
            />
          </label>

          <p className="section-desc" style={{ marginTop: '8px' }}>
            Select which apps to monitor for scam links and phishing attempts.
          </p>
          <div className="apps-grid">
            {settings.monitoredApps.map((app) => (
              <label key={app.id} className="app-toggle">
                <input
                  type="checkbox"
                  checked={app.enabled}
                  onChange={() => toggleApp(app.id)}
                />
                <span>{app.name}</span>
              </label>
            ))}
          </div>
          <div className="form-row">
            <label>Scan sensitivity</label>
            <select
              value={settings.sensitivity}
              onChange={(e) =>
                updateSetting('sensitivity', e.target.value as Settings['sensitivity'])
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <p className="section-desc">
              Higher sensitivity may produce more alerts but could include false positives.
            </p>
          </div>

        </section>

        {/* Alerts */}
        <section
          id="panel-alerts"
          role="tabpanel"
          aria-labelledby="tab-alerts"
          hidden={activeTab !== 'alerts'}
          className="settings-panel"
        >
          <h2>Alerts</h2>
          <label className="toggle-row">
            <span>Sound on alert</span>
            <input
              type="checkbox"
              checked={settings.alertPreferences.soundEnabled}
              onChange={(e) =>
                updateSetting('alertPreferences', {
                  ...settings.alertPreferences,
                  soundEnabled: e.target.checked,
                })
              }
            />
          </label>
          <label className="toggle-row">
            <span>Desktop notifications</span>
            <input
              type="checkbox"
              checked={settings.alertPreferences.desktopNotifications}
              onChange={(e) =>
                updateSetting('alertPreferences', {
                  ...settings.alertPreferences,
                  desktopNotifications: e.target.checked,
                })
              }
            />
          </label>
          <div className="form-row">
            <label>Notification type</label>
            <select
              value={settings.alertPreferences.notificationType}
              onChange={(e) =>
                updateSetting('alertPreferences', {
                  ...settings.alertPreferences,
                  notificationType: e.target.value as 'banner' | 'alert' | 'silent',
                })
              }
            >
              <option value="banner">Banner</option>
              <option value="alert">Alert</option>
              <option value="silent">Silent</option>
            </select>
          </div>
          <label className="toggle-row">
            <span>Quiet hours (only critical alerts)</span>
            <input
              type="checkbox"
              checked={settings.alertPreferences.quietHoursEnabled ?? false}
              onChange={(e) =>
                updateSetting('alertPreferences', {
                  ...settings.alertPreferences,
                  quietHoursEnabled: e.target.checked,
                })
              }
            />
          </label>
          {(settings.alertPreferences.quietHoursEnabled ?? false) && (
            <div className="form-row form-row-inline">
              <label>From</label>
              <input
                type="time"
                value={settings.alertPreferences.quietHoursStart ?? '22:00'}
                onChange={(e) =>
                  updateSetting('alertPreferences', {
                    ...settings.alertPreferences,
                    quietHoursStart: e.target.value,
                  })
                }
              />
              <label>To</label>
              <input
                type="time"
                value={settings.alertPreferences.quietHoursEnd ?? '07:00'}
                onChange={(e) =>
                  updateSetting('alertPreferences', {
                    ...settings.alertPreferences,
                    quietHoursEnd: e.target.value,
                  })
                }
              />
            </div>
          )}
          <label className="toggle-row">
            <span>Focus mode / Do Not Disturb (only critical)</span>
            <input
              type="checkbox"
              checked={settings.alertPreferences.focusModeEnabled ?? false}
              onChange={(e) =>
                updateSetting('alertPreferences', {
                  ...settings.alertPreferences,
                  focusModeEnabled: e.target.checked,
                })
              }
            />
          </label>
        </section>

        {/* Privacy */}
        <section
          id="panel-privacy"
          role="tabpanel"
          aria-labelledby="tab-privacy"
          hidden={activeTab !== 'privacy'}
          className="settings-panel"
        >
          <h2>Privacy &amp; data</h2>
          <p className="section-desc">
            ScamShield processes links and message content locally to detect threats. No data is sent to external servers for scanning.
          </p>
          <h3>Data we use</h3>
          <ul className="settings-list">
            <li>URLs and link destinations (checked against a local blocklist)</li>
            <li>Text content from selected apps (for AI-based scam detection)</li>
            <li>Alert history (stored locally for 30 days)</li>
          </ul>
          <h3>Anonymous usage statistics (opt-in)</h3>
          <p className="section-desc">
            Help improve ScamShield by sending anonymous usage data. You can turn this on or off anytime.
          </p>
          <label className="toggle-row">
            <span>Send anonymous usage statistics</span>
            <input
              type="checkbox"
              checked={usageStatsOptIn}
              onChange={async (e) => {
                const v = e.target.checked
                await window.scamshield?.setUsageStatsOptIn?.(v)
                setUsageStatsOptInState(v)
              }}
            />
          </label>
          <h3>Export your data</h3>
          <p className="section-desc">
            Export alert history as JSON or CSV from the Dashboard or Statistics page.
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                const json = await window.scamshield?.exportAlertsJSON?.()
                if (!json) return
                const blob = new Blob([json], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `scamshield-export-${new Date().toISOString().slice(0, 10)}.json`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              Export alerts (JSON)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                const csv = await window.scamshield?.exportAlertsCSV?.()
                if (!csv) return
                const blob = new Blob([csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `scamshield-export-${new Date().toISOString().slice(0, 10)}.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              Export alerts (CSV)
            </button>
          </div>
        </section>

        {/* About */}
        <section
          id="panel-about"
          role="tabpanel"
          aria-labelledby="tab-about"
          hidden={activeTab !== 'about'}
          className="settings-panel"
        >
          <h2>About ScamShield</h2>
          <p className="settings-version">Version 1.0.0</p>
          <p className="section-desc">
            ScamShield helps protect you from phishing links and scam content by monitoring supported apps and alerting you in real time.
          </p>
          <h3>Licenses</h3>
          <p className="section-desc">
            This app uses open-source software. See the project repository for full license information.
          </p>
          <h3>Support</h3>
          <p className="section-desc">
            For help and feedback, use the in-app feedback options or open an issue in the project repository.
          </p>
        </section>
      </main>
    </div>
  )
}
