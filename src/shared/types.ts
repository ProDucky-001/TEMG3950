// Shared types between main and renderer processes

export type ThreatStatus = 'safe' | 'warning' | 'threat'

export interface AppConfig {
  id: string
  name: string
  enabled: boolean
  icon?: string
}

export interface Alert {
  id: string
  timestamp: number
  type: 'phishing' | 'suspicious_link' | 'urgent_request' | 'unknown'
  severity: 'low' | 'medium' | 'high' | 'critical'
  source: string
  message: string
  link?: string
  appId?: string
  /** Actual risk score (0-100) from link scan when available */
  riskScore?: number
  /** Matched keywords or patterns that triggered the alert (for scam overlay) */
  triggers?: string[]
}

export interface Settings {
  monitoringEnabled: boolean
  monitoredApps: AppConfig[]
  alertPreferences: AlertPreferences
  sensitivity: SensitivityLevel
  launchAtStartup: boolean
  minimizeToTray: boolean
  closeToTray: boolean
  /** Enable screen capture + OCR when viewing email clients. Default true. */
  screenCaptureEnabled?: boolean
  /** Polling interval in ms when email client is active. Default 3000. */
  screenCapturePollIntervalMs?: number
  /** Show green corner indicator when screen capture is active. Default true. */
  showRecordingIndicator?: boolean
}

export interface AlertPreferences {
  soundEnabled: boolean
  notificationType: 'banner' | 'alert' | 'silent'
  desktopNotifications: boolean
  /** Quiet hours: no non-critical notifications */
  quietHoursEnabled?: boolean
  quietHoursStart?: string
  quietHoursEnd?: string
  /** Focus mode / Do Not Disturb: only critical */
  focusModeEnabled?: boolean
}

export type SensitivityLevel = 'low' | 'medium' | 'high'

export interface Statistics {
  linksScanned: number
  threatsDetected: number
  lastScanTime: number
}

export interface ProtectedAppStatus {
  appId: string
  appName: string
  status: 'active' | 'inactive' | 'error'
  lastChecked: number
}
