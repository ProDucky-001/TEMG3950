import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Alert, Statistics } from '../../shared/types'
import type { AlertStats } from '../../shared/alert-types'
import '../styles/dashboard.css'
import type { Settings } from '../../shared/types'

export default function Dashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [stats, setStats] = useState<Statistics | null>(null)
  const [alertStats, setAlertStats] = useState<AlertStats | null>(null)
  const [monitoringEnabled, setMonitoringEnabled] = useState(true)
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    if (window.scamshield) {
      const [alertsData, statsData, status, settingsData, alertStatsData] = await Promise.all([
        window.scamshield.getAlerts(),
        window.scamshield.getStatistics(),
        window.scamshield.getMonitoringStatus(),
        window.scamshield.getSettings(),
        window.scamshield.getAlertStats?.() ?? Promise.resolve(null),
      ])
      setAlerts(alertsData)
      setStats(statsData)
      setMonitoringEnabled(status.enabled)
      setSettings(settingsData)
      setAlertStats(alertStatsData ?? null)
    }
  }

  async function handleToggleMonitoring() {
    if (window.scamshield) {
      const enabled = await window.scamshield.toggleMonitoring()
      setMonitoringEnabled(enabled)
    }
  }

  async function handleClearAlerts() {
    if (window.scamshield) {
      await window.scamshield.clearAlerts()
      setAlerts([])
      setAlertStats(null)
    }
  }

  async function handleExportJSON() {
    if (!window.scamshield?.exportAlertsJSON) return
    const json = await window.scamshield.exportAlertsJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scamshield-alerts-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleExportCSV() {
    if (!window.scamshield?.exportAlertsCSV) return
    const csv = await window.scamshield.exportAlertsCSV()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scamshield-alerts-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - timestamp
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return date.toLocaleDateString()
  }

  const getSeverityColor = (severity: Alert['severity']) => {
    switch (severity) {
      case 'critical': return 'var(--danger)'
      case 'high': return 'var(--danger)'
      case 'medium': return 'var(--warning)'
      default: return 'var(--text-secondary)'
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="logo">
          <span className="logo-icon">🛡️</span>
          <h1>ScamShield</h1>
        </div>
        <nav className="nav">
          <Link to="/settings" className="nav-link">
            Settings
          </Link>
        </nav>
      </header>

      <main className="dashboard-content">
        <section className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{stats?.linksScanned ?? 0}</span>
            <span className="stat-label">Links Scanned</span>
          </div>
          <div className="stat-card">
            <span className="stat-value stat-danger">{stats?.threatsDetected ?? 0}</span>
            <span className="stat-label">Threats Detected</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">
              {monitoringEnabled ? (
                <span className="status-badge status-safe">Active</span>
              ) : (
                <span className="status-badge status-paused">Paused</span>
              )}
            </span>
            <span className="stat-label">Monitoring</span>
          </div>
        </section>

        <section className="monitoring-section">
          <button
            className={`toggle-btn ${monitoringEnabled ? 'active' : ''}`}
            onClick={handleToggleMonitoring}
          >
            {monitoringEnabled ? 'Pause Monitoring' : 'Resume Monitoring'}
          </button>
        </section>

        <section className="alerts-section">
          <div className="section-header">
            <h2>Recent Alerts</h2>
            <div className="section-actions">
              {alertStats != null && (
                <span className="alert-stats">
                  Last 24h: {alertStats.last24h} · 7d: {alertStats.last7d} · 30d: {alertStats.last30d}
                </span>
              )}
              {alerts.length > 0 && (
                <>
                  <button className="clear-btn" onClick={handleClearAlerts}>
                    Clear All
                  </button>
                  {window.scamshield?.exportAlertsJSON && (
                    <>
                      <button className="clear-btn" onClick={handleExportJSON}>
                        Export JSON
                      </button>
                      <button className="clear-btn" onClick={handleExportCSV}>
                        Export CSV
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {alerts.length === 0 ? (
            <div className="empty-state">
              <p>No alerts yet. You're protected!</p>
            </div>
          ) : (
            <ul className="alerts-list">
              {alerts.map((alert) => (
                <li key={alert.id} className="alert-item">
                  <span
                    className="alert-severity"
                    style={{ color: getSeverityColor(alert.severity) }}
                  >
                    {alert.severity}
                  </span>
                  <div className="alert-content">
                    <p className="alert-message">{alert.message}</p>
                    <span className="alert-meta">
                      {alert.source} • {formatTime(alert.timestamp)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="protected-apps">
          <h2>Protected Apps</h2>
          {!settings ? (
            <p className="section-desc">Loading app status…</p>
          ) : (
            <ul className="alerts-list">
              {settings.monitoredApps.map((app) => {
                const active = monitoringEnabled && settings.monitoringEnabled && app.enabled
                return (
                  <li key={app.id} className="alert-item">
                    <span
                      className="alert-severity"
                      style={{ color: active ? 'var(--success)' : 'var(--text-secondary)' }}
                    >
                      {active ? 'active' : 'inactive'}
                    </span>
                    <div className="alert-content">
                      <p className="alert-message">{app.name}</p>
                      <span className="alert-meta">
                        {app.enabled ? 'Enabled in settings' : 'Disabled in settings'}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
