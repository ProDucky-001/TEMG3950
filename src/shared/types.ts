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
}

export interface Settings {
  monitoringEnabled: boolean
  monitoredApps: AppConfig[]
  alertPreferences: AlertPreferences
  sensitivity: SensitivityLevel
  launchAtStartup: boolean
  minimizeToTray: boolean
  closeToTray: boolean
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
