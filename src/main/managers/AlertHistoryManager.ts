import type { Alert } from '../../shared/types'
import type { AlertSeverity, AlertStats } from '../../shared/alert-types'

const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000

export interface AlertHistoryManagerOptions {
  getAlerts: () => Alert[]
}

/**
 * Provides alert history (last 30 days), statistics, and export (JSON, CSV).
 */
export class AlertHistoryManager {
  constructor(private readonly getAlerts: () => Alert[]) {}

  getAlertsLast30Days(): Alert[] {
    const cutoff = Date.now() - MS_30_DAYS
    return this.getAlerts().filter((a) => a.timestamp >= cutoff)
  }

  getStats(): AlertStats {
    const alerts = this.getAlertsLast30Days()
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000

    const bySeverity: Record<AlertSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    }
    const byType: Record<string, number> = {}

    let last24h = 0
    let last7d = 0
    let last30d = alerts.length

    for (const a of alerts) {
      bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1
      byType[a.type] = (byType[a.type] ?? 0) + 1
      const age = now - a.timestamp
      if (age <= day) last24h++
      if (age <= 7 * day) last7d++
    }

    return {
      total: alerts.length,
      bySeverity,
      byType,
      last24h,
      last7d,
      last30d,
    }
  }

  exportJSON(): string {
    const data = {
      exportedAt: new Date().toISOString(),
      alerts: this.getAlertsLast30Days(),
      stats: this.getStats(),
    }
    return JSON.stringify(data, null, 2)
  }

  exportCSV(): string {
    const alerts = this.getAlertsLast30Days()
    const header = 'id,timestamp,type,severity,source,message,link,appId'
    const rows = alerts.map((a) =>
      [
        a.id,
        new Date(a.timestamp).toISOString(),
        a.type,
        a.severity,
        escapeCsv(a.source),
        escapeCsv(a.message),
        a.link ? escapeCsv(a.link) : '',
        a.appId ?? '',
      ].join(',')
    )
    return [header, ...rows].join('\n')
  }
}

function escapeCsv(s: string): string {
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
