import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Alert } from '../../shared/types'
import { SEVERITY_LABELS, SEVERITY_COLORS } from '../../shared/alert-types'
import '../styles/alert-detail.css'

export default function AlertDetail() {
  const { id } = useParams<{ id: string }>()
  const [alert, setAlert] = useState<Alert | null>(null)

  useEffect(() => {
    if (!window.scamshield || !id) return
    window.scamshield.getAlerts().then((alerts) => {
      const found = alerts.find((a) => a.id === id)
      setAlert(found ?? null)
    })
  }, [id])

  const handleReportFalsePositive = () => {
    window.scamshield?.reportFalsePositive?.(alert.id, 'false_positive')
    alert('Thank you. Your feedback has been recorded.')
  }

  const handleHelpImprove = () => {
    window.scamshield?.reportFalsePositive?.(alert.id, 'help_improve')
    window.scamshield?.openSettings?.()
  }

  if (alert === undefined) {
    return (
      <div className="alert-detail-page">
        <p className="alert-detail-loading">Loading…</p>
      </div>
    )
  }

  if (alert === null) {
    return (
      <div className="alert-detail-page">
        <p className="alert-detail-loading">Alert not found.</p>
        <Link to="/" className="btn btn-primary">Back to Dashboard</Link>
      </div>
    )
  }

  const color = SEVERITY_COLORS[alert.severity] ?? 'var(--text-secondary)'
  const timeline = [
    { label: 'Detected', time: alert.timestamp },
    { label: 'Content analyzed', time: alert.timestamp },
    { label: 'Alert shown', time: alert.timestamp },
  ]

  return (
    <div className="alert-detail-page" role="main">
      <header className="alert-detail-header">
        <Link to="/" className="back-link">← Dashboard</Link>
        <h1>Alert details</h1>
      </header>

      <div className="alert-detail-card">
        <div className="alert-detail-meta">
          <span
            className={`alert-detail-severity threat-${alert.severity}`}
            style={{ color }}
          >
            {SEVERITY_LABELS[alert.severity]}
          </span>
          <span className="alert-detail-type">{alert.type.replace('_', ' ')}</span>
          <span className="alert-detail-time">
            {new Date(alert.timestamp).toLocaleString()}
          </span>
        </div>

        <h2 className="alert-detail-title">What happened</h2>
        <p className="alert-detail-message">{alert.message}</p>

        {alert.link && (
          <>
            <h2 className="alert-detail-title">Link analyzed</h2>
            <p className="alert-detail-link" title={alert.link}>
              {alert.link}
            </p>
          </>
        )}

        <h2 className="alert-detail-title">Timeline</h2>
        <ul className="alert-detail-timeline">
          {timeline.map((item, i) => (
            <li key={i}>
              <strong>{item.label}</strong>
              <span>{new Date(item.time).toLocaleString()}</span>
            </li>
          ))}
        </ul>

        <h2 className="alert-detail-title">Actions taken</h2>
        <p className="alert-detail-actions">
          ScamShield blocked this content from being opened and showed you a warning notification.
        </p>

        <div className="alert-detail-feedback">
          <h2 className="alert-detail-title">Feedback</h2>
          <div className="alert-detail-feedback-btns">
            <button type="button" className="btn btn-secondary" onClick={handleReportFalsePositive}>
              Report false positive
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleHelpImprove}>
              Help improve detection
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
