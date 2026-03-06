import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts'
import type { AlertStats } from '../../shared/alert-types'
import { SEVERITY_LABELS, SEVERITY_COLORS } from '../../shared/alert-types'
import '../styles/statistics.css'

type Period = '7d' | '30d'

const SEVERITY_ORDER: (keyof AlertStats['bySeverity'])[] = [
  'critical',
  'high',
  'medium',
  'low',
]

export default function StatisticsView() {
  const [alertStats, setAlertStats] = useState<AlertStats | null>(null)
  const [period, setPeriod] = useState<Period>('30d')

  useEffect(() => {
    if (!window.scamshield?.getAlertStats) return
    window.scamshield.getAlertStats().then(setAlertStats)
  }, [])

  const barData = SEVERITY_ORDER.map((s) => ({
    name: SEVERITY_LABELS[s],
    count: alertStats?.bySeverity[s] ?? 0,
    fill: SEVERITY_COLORS[s],
  }))

  const pieData = barData.filter((d) => d.count > 0)

  const handleExportCSV = async () => {
    const csv = await window.scamshield?.exportAlertsCSV?.()
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scamshield-stats-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportJSON = async () => {
    const json = await window.scamshield?.exportAlertsJSON?.()
    if (!json) return
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scamshield-stats-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="statistics-page" role="main">
      <header className="statistics-header">
        <Link to="/" className="back-link">← Dashboard</Link>
        <h1>Statistics</h1>
      </header>

      <div className="statistics-controls">
        <div className="period-selector">
          <button
            type="button"
            className={`btn btn-ghost ${period === '7d' ? 'active' : ''}`}
            onClick={() => setPeriod('7d')}
          >
            Last 7 days
          </button>
          <button
            type="button"
            className={`btn btn-ghost ${period === '30d' ? 'active' : ''}`}
            onClick={() => setPeriod('30d')}
          >
            Last 30 days
          </button>
        </div>
        <div className="export-buttons">
          <button type="button" className="btn btn-secondary" onClick={handleExportCSV}>
            Export CSV
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleExportJSON}>
            Export JSON
          </button>
        </div>
      </div>

      {!alertStats ? (
        <p className="statistics-loading">Loading statistics…</p>
      ) : (
        <>
          <section className="statistics-cards" aria-label="Summary">
            <div className="stat-card">
              <span className="stat-value">{alertStats.total}</span>
              <span className="stat-label">Total alerts</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{alertStats.last24h}</span>
              <span className="stat-label">Last 24 hours</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{alertStats.last7d}</span>
              <span className="stat-label">Last 7 days</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{alertStats.last30d}</span>
              <span className="stat-label">Last 30 days</span>
            </div>
          </section>

          <section className="statistics-chart-section" aria-label="Alerts by severity">
            <h2>Threat category breakdown</h2>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
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
                  />
                  <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {pieData.length > 0 && (
            <section className="statistics-chart-section" aria-label="Distribution">
              <h2>Distribution</h2>
              <div className="chart-container chart-pie">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, count }) => `${name}: ${count}`}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
