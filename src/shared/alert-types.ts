/**
 * Alert and notification system types for ScamShield.
 */

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'

export const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: '#dc2626', // red
  high: '#ea580c',     // orange
  medium: '#ca8a04',   // yellow
  low: '#2563eb',      // blue
}

export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

/** Delivery behavior by severity: all immediate so user always sees a popup */
export const SEVERITY_DELIVERY: Record<AlertSeverity, 'immediate' | 'batch'> = {
  critical: 'immediate',
  high: 'immediate',
  medium: 'immediate',
  low: 'immediate',
}

export type AlertChannel = 'native' | 'in_app' | 'tray' | 'sound'

export interface AlertGroupKey {
  severity: AlertSeverity
  type: string
  /** Rounded to time window (e.g. 5 min) */
  windowStart: number
}

export interface QuietHoursConfig {
  enabled: boolean
  start: string // "22:00"
  end: string   // "07:00"
}

export interface AlertStats {
  total: number
  bySeverity: Record<AlertSeverity, number>
  byType: Record<string, number>
  last24h: number
  last7d: number
  last30d: number
}
