import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { Alert, Statistics, Settings } from '../../shared/types'
import type { AlertStats } from '../../shared/alert-types'
import { SEVERITY_LABELS } from '../../shared/alert-types'
import ThreatDetailsPopup from './ThreatDetailsPopup'
import '../styles/dashboard.css'

type AlertSort = 'newest' | 'oldest' | 'severity'
type AlertFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'

export default function MainDashboard() {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [stats, setStats] = useState<Statistics | null>(null)
  const [alertStats, setAlertStats] = useState<AlertStats | null>(null)
  const [monitoringEnabled, setMonitoringEnabled] = useState(true)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all')
  const [alertSort, setAlertSort] = useState<AlertSort>('newest')
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [popupOpen, setPopupOpen] = useState(false)
  const [scanUrlInput, setScanUrlInput] = useState('')
  const [scanResult, setScanResult] = useState<{
    url: string
    riskScore: number
    explanation: string
    recommendations: string[]
  } | null>(null)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    if (window.scamshield) {
      const [alertsData, statsData, status, settingsData, alertStatsData] =
        await Promise.all([
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

  async function handleRunFullScan() {
    if (!window.scamshield) return
    await loadData()
  }

  async function handleCheckUrl() {
    const url = scanUrlInput.trim()
    if (!url || !window.scamshield) return
    setScanning(true)
    setScanResult(null)
    try {
      const result = await window.scamshield.scanLink(url)
      setScanResult({
        url: result.resolvedUrl ?? result.url,
        riskScore: result.riskScore,
        explanation: result.explanation,
        recommendations: result.recommendations ?? [],
      })
      await loadData()
    } catch {
      setScanResult({
        url,
        riskScore: 0,
        explanation: 'Could not analyze this link.',
        recommendations: ['Check the URL format and try again.'],
      })
    } finally {
      setScanning(false)
    }
  }

  const filteredAlerts = alerts
    .filter((a) => alertFilter === 'all' || a.severity === alertFilter)
    .sort((a, b) => {
      if (alertSort === 'newest') return b.timestamp - a.timestamp
      if (alertSort === 'oldest') return a.timestamp - b.timestamp
      const order: Alert['severity'][] = ['critical', 'high', 'medium', 'low']
      return order.indexOf(a.severity) - order.indexOf(b.severity)
    })

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - timestamp
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return date.toLocaleDateString()
  }

  const lastScanLabel = stats?.lastScanTime
    ? formatTime(stats.lastScanTime)
    : 'Never'

  const chartData = alertStats
    ? [
        { name: 'Critical', count: alertStats.bySeverity.critical ?? 0, fill: 'var(--danger)' },
        { name: 'High', count: alertStats.bySeverity.high ?? 0, fill: 'var(--warning)' },
        { name: 'Medium', count: alertStats.bySeverity.medium ?? 0, fill: 'var(--warning)' },
        { name: 'Low', count: alertStats.bySeverity.low ?? 0, fill: 'var(--info)' },
      ]
    : []

  const openThreatPopup = (alert: Alert) => {
    setSelectedAlert(alert)
    setPopupOpen(true)
  }

  const closePopup = () => {
    setPopupOpen(false)
    setSelectedAlert(null)
  }

  const openAlertDetail = (alert: Alert) => {
    closePopup()
    navigate(`/alerts/${alert.id}`)
  }

  return (
    <div className="dashboard" role="main" aria-label="ScamShield Dashboard">
      <header className="dashboard-header">
        <div className="logo">
          <span className="logo-icon" aria-hidden>🛡️</span>
          <h1>ScamShield</h1>
        </div>
        <nav className="nav" aria-label="Main navigation">
          <Link to="/statistics" className="nav-link">Statistics</Link>
          <Link to="/settings" className="nav-link">Settings</Link>
          <Link to="/onboarding" className="nav-link">Help</Link>
        </nav>
      </header>

      <main className="dashboard-content">
        {/* Overview cards */}
        <section className="overview-cards" aria-label="Overview">
          <div className="card card-protection">
            <div className="card-header">
              <h2 className="card-title">Protection</h2>
              <span
                className={`status-badge ${monitoringEnabled ? 'status-safe' : 'status-paused'}`}
                aria-live="polite"
              >
                {monitoringEnabled ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="card-desc">
              {monitoringEnabled
                ? 'Clipboard is monitored for links. Paste or copy a suspicious URL to trigger a check.'
                : 'Enable protection to scan links when you copy them.'}
            </p>
            <button
              type="button"
              className={`btn btn-primary toggle-btn ${monitoringEnabled ? 'active' : ''}`}
              onClick={handleToggleMonitoring}
              aria-pressed={monitoringEnabled}
              aria-label={monitoringEnabled ? 'Pause protection' : 'Enable protection'}
            >
              {monitoringEnabled ? 'Pause Protection' : 'Enable Protection'}
            </button>
          </div>

          <div className="card card-threats">
            <h2 className="card-title">Threats blocked</h2>
            <div className="threats-row">
              <div className="threat-cell">
                <span className="threat-value">{alertStats?.last24h ?? 0}</span>
                <span className="threat-label">Today</span>
              </div>
              <div className="threat-cell">
                <span className="threat-value">{alertStats?.last7d ?? 0}</span>
                <span className="threat-label">This week</span>
              </div>
              <div className="threat-cell">
                <span className="threat-value">{alertStats?.last30d ?? 0}</span>
                <span className="threat-label">This month</span>
              </div>
            </div>
          </div>

          <div className="card card-scan">
            <h2 className="card-title">Last scan</h2>
            <p className="card-stat card-scan-time">{lastScanLabel}</p>
          </div>
        </section>

        {/* Check URL */}
        <section className="check-url-section" aria-label="Check a link">
          <h2 className="section-title">Check URL</h2>
          <p className="section-desc">
            Paste a link to see its threat score. URLs are also checked automatically when you copy them (clipboard monitoring).
          </p>
          <div className="check-url-row">
            <input
              type="url"
              className="check-url-input"
              placeholder="https://example.com/page"
              value={scanUrlInput}
              onChange={(e) => setScanUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCheckUrl()}
              aria-label="URL to check"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCheckUrl}
              disabled={scanning || !scanUrlInput.trim()}
              aria-label="Scan link"
            >
              {scanning ? 'Scanning…' : 'Scan link'}
            </button>
          </div>
          {scanResult && (
            <div className="check-url-result card">
              <div className="check-url-score-row">
                <span className="check-url-score-label">Threat score</span>
                <span
                  className={`check-url-score-value score-${scanResult.riskScore >= 70 ? 'high' : scanResult.riskScore >= 40 ? 'medium' : 'low'}`}
                >
                  {scanResult.riskScore}/100
                </span>
              </div>
              <div className="threat-popup-progress-wrap" style={{ marginBottom: 12 }}>
                <div
                  className="threat-popup-progress"
                  style={{
                    width: `${scanResult.riskScore}%`,
                    backgroundColor:
                      scanResult.riskScore >= 70
                        ? 'var(--danger)'
                        : scanResult.riskScore >= 40
                          ? 'var(--warning)'
                          : 'var(--success)',
                  }}
                  role="progressbar"
                  aria-valuenow={scanResult.riskScore}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <p className="check-url-explanation">{scanResult.explanation}</p>
              {scanResult.recommendations.length > 0 && (
                <ul className="check-url-recommendations">
                  {scanResult.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
              <div className="check-url-reliability" role="note">
                <strong>How this score is determined:</strong> Analysis runs locally using multiple rule-based signals (known phishing domains, suspicious TLDs, URL shorteners, login/password params, scam keywords) and a trusted-domain allowlist to reduce false positives. We require multiple indicators for high risk and cap single-signal scores. No data is sent to external servers. This aims for high reliability—use as one input and verify through official sources when unsure.
              </div>
            </div>
          )}
        </section>

        {/* Quick actions */}
        <section className="quick-actions" aria-label="Quick actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleToggleMonitoring}
            disabled={monitoringEnabled}
            aria-disabled={monitoringEnabled}
          >
            {monitoringEnabled ? 'Protection on' : 'Enable Protection'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleRunFullScan}
            aria-label="Run full scan"
          >
            Run full scan
          </button>
          {settings && (
            <label className="quick-action-toggle">
              <input
                type="checkbox"
                checked={settings.showRecordingIndicator !== false}
                onChange={async (e) => {
                  if (!window.scamshield) return
                  const updated = await window.scamshield.updateSettings({
                    showRecordingIndicator: e.target.checked,
                  })
                  setSettings(updated)
                }}
                aria-label="Show green corner indicator when recording"
              />
              <span>Green corner indicator when recording</span>
            </label>
          )}
          <Link to="/settings" className="btn btn-secondary">
            Open settings
          </Link>
        </section>

        {/* Charts */}
        {chartData.some((d) => d.count > 0) && (
          <section className="dashboard-chart" aria-label="Alerts by severity">
            <h2 className="section-title">Alerts by severity</h2>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="name"
                    stroke="var(--text-secondary)"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                    }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                  />
                  <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Recent alerts */}
        <section className="alerts-section" aria-label="Recent alerts">
          <div className="section-header">
            <h2 className="section-title">Recent alerts</h2>
            <div className="section-actions">
              {alertStats != null && (
                <span className="alert-stats" aria-hidden>
                  Last 24h: {alertStats.last24h} · 7d: {alertStats.last7d} · 30d:{' '}
                  {alertStats.last30d}
                </span>
              )}
              <select
                aria-label="Filter by severity"
                value={alertFilter}
                onChange={(e) => setAlertFilter(e.target.value as AlertFilter)}
                className="filter-select"
              >
                <option value="all">All severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select
                aria-label="Sort alerts"
                value={alertSort}
                onChange={(e) => setAlertSort(e.target.value as AlertSort)}
                className="filter-select"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="severity">By severity</option>
              </select>
              {alerts.length > 0 && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleClearAlerts}
                    aria-label="Clear all alerts"
                  >
                    Clear all
                  </button>
                  {window.scamshield?.exportAlertsJSON && (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={async () => {
                          const json = await window.scamshield!.exportAlertsJSON()
                          const blob = new Blob([json], { type: 'application/json' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `scamshield-alerts-${new Date().toISOString().slice(0, 10)}.json`
                          a.click()
                          URL.revokeObjectURL(url)
                        }}
                      >
                        Export JSON
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={async () => {
                          const csv = await window.scamshield!.exportAlertsCSV()
                          const blob = new Blob([csv], { type: 'text/csv' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `scamshield-alerts-${new Date().toISOString().slice(0, 10)}.csv`
                          a.click()
                          URL.revokeObjectURL(url)
                        }}
                      >
                        Export CSV
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {filteredAlerts.length === 0 ? (
            <div className="empty-state" role="status">
              <p>
                {alerts.length === 0
                  ? "No alerts yet. You're protected!"
                  : 'No alerts match the current filter.'}
              </p>
            </div>
          ) : (
            <ul className="alerts-list">
              {filteredAlerts.map((alert) => (
                <li key={alert.id} className="alert-item">
                  <span
                    className={`alert-severity threat-${alert.severity}`}
                    title={SEVERITY_LABELS[alert.severity]}
                  >
                    {SEVERITY_LABELS[alert.severity]}
                  </span>
                  <button
                    type="button"
                    className="alert-content alert-content-btn"
                    onClick={() => openThreatPopup(alert)}
                    aria-label={`View details for alert: ${alert.message.slice(0, 50)}`}
                  >
                    <p className="alert-message">{alert.message}</p>
                    <span className="alert-meta">
                      {alert.source} · {formatTime(alert.timestamp)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {popupOpen && selectedAlert && (
        <ThreatDetailsPopup
          alert={selectedAlert}
          onClose={closePopup}
          onViewDetails={() => openAlertDetail(selectedAlert)}
        />
      )}
    </div>
  )
}
