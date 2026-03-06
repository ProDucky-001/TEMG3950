import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Settings } from '../../shared/types'
import '../styles/settings.css'

export default function Settings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [dashboardAlwaysOnTop, setDashboardAlwaysOnTopState] = useState(false)

  useEffect(() => {
    if (window.scamshield) {
      window.scamshield.getSettings().then(setSettings)
      window.scamshield.getDashboardAlwaysOnTop?.().then(setDashboardAlwaysOnTopState)
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
    <div className="settings">
      <header className="settings-header">
        <Link to="/" className="back-link">
          ← Dashboard
        </Link>
        <h1>Settings</h1>
      </header>

      <main className="settings-content">
        <section className="settings-section">
          <h2>Monitoring</h2>
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
        </section>

        <section className="settings-section">
          <h2>Monitored Apps</h2>
          <p className="section-desc">
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
        </section>

        <section className="settings-section">
          <h2>Alert Preferences</h2>
          <label className="toggle-row">
            <span>Sound alerts</span>
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

        <section className="settings-section">
          <h2>Sensitivity</h2>
          <p className="section-desc">
            Higher sensitivity may produce more alerts but could include false
            positives.
          </p>
          <div className="form-row">
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
          </div>
        </section>

        <section className="settings-section">
          <h2>App Behavior</h2>
          <label className="toggle-row">
            <span>Launch at startup</span>
            <input
              type="checkbox"
              checked={settings.launchAtStartup}
              onChange={toggleLaunchAtStartup}
            />
          </label>
          <label className="toggle-row">
            <span>Minimize to tray</span>
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
        </section>
      </main>
    </div>
  )
}
