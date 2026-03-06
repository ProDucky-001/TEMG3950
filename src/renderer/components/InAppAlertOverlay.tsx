import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Alert } from '../../shared/types'
import { SEVERITY_COLORS, SEVERITY_LABELS } from '../../shared/alert-types'
import './InAppAlertOverlay.css'

const TOAST_DURATION_MS = 8000

export default function InAppAlertOverlay() {
  const [alert, setAlert] = useState<Alert | null>(null)
  const [visible, setVisible] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!window.scamshield?.subscribeAlertPushed) return
    const unsubscribe = window.scamshield.subscribeAlertPushed((a) => {
      setAlert(a)
      setVisible(true)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!visible || !alert) return
    const t = setTimeout(() => setVisible(false), TOAST_DURATION_MS)
    return () => clearTimeout(t)
  }, [visible, alert])

  if (!alert) return null

  const color = SEVERITY_COLORS[alert.severity] ?? 'var(--text-secondary)'
  const label = SEVERITY_LABELS[alert.severity] ?? alert.severity

  function handleIgnore() {
    setVisible(false)
    setAlert(null)
  }

  function handleGetDetails() {
    setVisible(false)
    setAlert(null)
    navigate('/')
  }

  function handleLearnMore() {
    setVisible(false)
    setAlert(null)
    window.scamshield?.openSettings()
  }

  return (
    <div
      className={`in-app-alert-overlay ${visible ? 'in-app-alert-overlay--visible' : ''}`}
      role="alert"
      aria-live="polite"
    >
      <div
        className="in-app-alert-overlay__panel"
        style={{ borderLeftColor: color }}
      >
        <div className="in-app-alert-overlay__header">
          <span
            className="in-app-alert-overlay__severity"
            style={{ color }}
          >
            {label}
          </span>
          <button
            type="button"
            className="in-app-alert-overlay__close"
            onClick={handleIgnore}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
        <p className="in-app-alert-overlay__message">{alert.message}</p>
        {alert.link && (
          <p className="in-app-alert-overlay__link" title={alert.link}>
            {alert.link.slice(0, 50)}…
          </p>
        )}
        <div className="in-app-alert-overlay__actions">
          <button
            type="button"
            className="in-app-alert-overlay__btn in-app-alert-overlay__btn--secondary"
            onClick={handleIgnore}
          >
            Ignore
          </button>
          <button
            type="button"
            className="in-app-alert-overlay__btn in-app-alert-overlay__btn--primary"
            onClick={handleGetDetails}
          >
            Get Details
          </button>
          <button
            type="button"
            className="in-app-alert-overlay__btn in-app-alert-overlay__btn--secondary"
            onClick={handleLearnMore}
          >
            Learn More
          </button>
        </div>
      </div>
    </div>
  )
}
