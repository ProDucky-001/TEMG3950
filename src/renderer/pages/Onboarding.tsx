import { useState } from 'react'
import { Link } from 'react-router-dom'
import '../styles/onboarding.css'

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to ScamShield',
    body: 'ScamShield runs in your system tray and monitors selected apps for phishing links and scam content. When we detect a threat, we’ll alert you immediately.',
  },
  {
    id: 'permissions',
    title: 'Permissions',
    body: 'To monitor links and content, ScamShield needs:',
    list: [
      'Accessibility access – to read content from selected apps (e.g. browsers, mail, messengers).',
      'Notification permission – to show you alerts when threats are detected.',
    ],
  },
  {
    id: 'apps',
    title: 'Choose apps to monitor',
    body: 'In Settings → Monitoring you can enable or disable which apps are monitored. Start with the ones you use most for links and messages.',
  },
  {
    id: 'config',
    title: 'You’re all set',
    body: 'You can change monitoring, alert preferences, and protected apps anytime in Settings. Click Dashboard to see your protection status and recent alerts.',
  },
]

export default function OnboardingFlow() {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="onboarding" role="main" aria-label="Getting started">
      <div className="onboarding-card">
        <div className="onboarding-progress">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`onboarding-dot ${i === step ? 'active' : ''}`}
              aria-label={`Step ${i + 1}: ${s.title}`}
              aria-current={i === step ? 'step' : undefined}
              onClick={() => setStep(i)}
            />
          ))}
        </div>

        <h1 className="onboarding-title">{current.title}</h1>
        <p className="onboarding-body">{current.body}</p>
        {current.list && (
          <ul className="onboarding-list">
            {current.list.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}

        <div className="onboarding-actions">
          {step > 0 ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(step - 1)}
            >
              Back
            </button>
          ) : (
            <span />
          )}
          {isLast ? (
            <Link to="/" className="btn btn-primary">
              Go to Dashboard
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(step + 1)}
            >
              Next
            </button>
          )}
        </div>
      </div>

      <p className="onboarding-skip">
        <Link to="/">Skip and go to Dashboard</Link>
      </p>
    </div>
  )
}
