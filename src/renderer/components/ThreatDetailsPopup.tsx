import { useEffect, useRef } from 'react'
import type { Alert } from '../../shared/types'
import { SEVERITY_LABELS, SEVERITY_COLORS } from '../../shared/alert-types'
import './ThreatDetailsPopup.css'

const SEVERITY_RISK_SCORE: Record<Alert['severity'], number> = {
  critical: 95,
  high: 75,
  medium: 50,
  low: 25,
}

const RECOMMENDATIONS: Record<Alert['severity'], string> = {
  critical:
    'Do not click the link or share any personal or financial information. Consider blocking the sender.',
  high: 'Avoid interacting with this content. Delete the message or email if possible.',
  medium: 'Proceed with caution. Verify the source through official channels before taking action.',
  low: 'This was flagged for review. You can ignore if you trust the source.',
}

export interface ThreatDetailsPopupProps {
  alert: Alert
  onClose: () => void
  onViewDetails: () => void
}

export default function ThreatDetailsPopup({
  alert,
  onClose,
  onViewDetails,
}: ThreatDetailsPopupProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const riskScore =
    alert.riskScore !== undefined && alert.riskScore !== null
      ? alert.riskScore
      : SEVERITY_RISK_SCORE[alert.severity]
  const color = SEVERITY_COLORS[alert.severity] ?? 'var(--text-secondary)'
  const label = SEVERITY_LABELS[alert.severity]

  return (
    <div
      className="threat-popup-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="threat-popup-title"
      aria-describedby="threat-popup-desc"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        className="threat-popup"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="threat-popup-header">
          <h2 id="threat-popup-title" className="threat-popup-title">
            Threat detected
          </h2>
          <button
            type="button"
            className="threat-popup-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="threat-popup-risk">
          <div className="threat-popup-risk-label">
            <span>Risk score</span>
            <span className="threat-popup-risk-value" style={{ color }}>
              {riskScore}/100
            </span>
          </div>
          <div className="threat-popup-progress-wrap">
            <div
              className="threat-popup-progress"
              style={{ width: `${riskScore}%`, backgroundColor: color }}
              role="progressbar"
              aria-valuenow={riskScore}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Risk level"
            />
          </div>
        </div>

        <p id="threat-popup-desc" className="threat-popup-severity" style={{ color }}>
          {label} · {alert.type.replace('_', ' ')}
        </p>

        <div className="threat-popup-message">
          <strong>What we found</strong>
          <p>{alert.message}</p>
        </div>

        {alert.link && (
          <div className="threat-popup-link">
            <strong>Link</strong>
            <p className="threat-popup-link-url" title={alert.link}>
              {alert.link.length > 60 ? `${alert.link.slice(0, 60)}…` : alert.link}
            </p>
          </div>
        )}

        <div className="threat-popup-recommendation">
          <strong>Recommendation</strong>
          <p>{RECOMMENDATIONS[alert.severity]}</p>
        </div>

        <div className="threat-popup-reliability" role="note">
          <strong>About this score</strong>
          <p>
            Threat scores are computed locally using rule-based checks: known phishing domains, suspicious TLDs, URL shorteners, and scam-related keywords. No data is sent to external servers. Use this as one input—not a guarantee—and verify through official channels when unsure.
          </p>
        </div>

        <div className="threat-popup-actions">
          <button type="button" className="btn btn-primary" onClick={onViewDetails}>
            View full details
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
