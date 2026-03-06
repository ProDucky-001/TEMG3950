import { Notification, shell } from 'electron'
import type { Alert, AlertPreferences } from '../../shared/types'
import type { AlertSeverity } from '../../shared/alert-types'
import { SEVERITY_LABELS, SEVERITY_DELIVERY } from '../../shared/alert-types'
import { logger } from '../services/logger'

const GROUP_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const BATCH_DELAY_MS = 15 * 1000     // 15 seconds for low/medium batch

export interface AlertPresenterOptions {
  onOpenDashboard: () => void
  onOpenSettings: () => void
  isQuietHours: () => boolean
  isFocusMode: () => boolean
}

/**
 * Presents alerts via native OS notifications with actions. Handles grouping and batching.
 */
export class AlertPresenter {
  private readonly groupKeyToLastShown = new Map<string, number>()
  private batchQueue: Alert[] = []
  private batchPrefs: AlertPreferences | null = null
  private batchTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: AlertPresenterOptions) {}

  present(alert: Alert, prefs: AlertPreferences): void {
    if (this.shouldSuppress(alert, prefs)) return

    const severity = alert.severity as AlertSeverity
    const delivery = SEVERITY_DELIVERY[severity]

    if (delivery === 'batch' && (severity === 'low' || severity === 'medium')) {
      this.enqueueBatch(alert, prefs)
      return
    }

    this.showNow(alert, prefs)
  }

  flushBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
    if (this.batchQueue.length === 0) return
    const prefs = this.batchPrefs
    this.batchPrefs = null
    if (!prefs) return
    const count = this.batchQueue.length
    const latest = this.batchQueue[this.batchQueue.length - 1]
    this.batchQueue = []
    this.showNow(
      {
        ...latest,
        message: count > 1 ? `${count} alerts: ${latest.message}` : latest.message,
      },
      prefs
    )
  }

  private getPrefsForBatch(): AlertPreferences | undefined {
    return this.batchPrefs ?? undefined
  }

  private enqueueBatch(alert: Alert, prefs: AlertPreferences): void {
    this.batchQueue.push(alert)
    this.batchPrefs = prefs
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null
        this.flushBatch()
      }, BATCH_DELAY_MS)
    }
  }

  private shouldSuppress(alert: Alert, prefs: AlertPreferences): boolean {
    if (this.options.isQuietHours() && alert.severity !== 'critical') return true
    if (this.options.isFocusMode() && alert.severity !== 'critical') return true
    if (!prefs.desktopNotifications) return true
    if (!Notification.isSupported()) return true

    const key = this.groupKey(alert)
    const last = this.groupKeyToLastShown.get(key)
    if (last && Date.now() - last < GROUP_WINDOW_MS) {
      logger.debug('AlertPresenter: suppressed duplicate group', key)
      return true
    }
    return false
  }

  private groupKey(alert: Alert): string {
    const windowStart = Math.floor(alert.timestamp / GROUP_WINDOW_MS) * GROUP_WINDOW_MS
    return `${alert.severity}:${alert.type}:${windowStart}`
  }

  private showNow(alert: Alert, prefs: AlertPreferences): void {
    const key = this.groupKey(alert)
    this.groupKeyToLastShown.set(key, Date.now())
    if (this.groupKeyToLastShown.size > 50) {
      const oldest = Math.min(...this.groupKeyToLastShown.values())
      for (const [k, v] of this.groupKeyToLastShown.entries()) {
        if (v <= oldest) this.groupKeyToLastShown.delete(k)
      }
    }

    const title = `ScamShield: ${SEVERITY_LABELS[alert.severity as AlertSeverity]}`
    const body = alert.message.slice(0, 200)

    const n = new Notification({
      title,
      body,
      silent: !prefs.soundEnabled,
      urgency: alert.severity === 'critical' ? 'critical' : 'normal',
      ...(process.platform === 'darwin' && {
        actions: [
          { type: 'button', text: 'Get Details' },
          { type: 'button', text: 'Open Settings' },
        ],
      }),
    })

    n.on('click', () => this.options.onOpenDashboard())
    n.on('action', (_e, index: number) => {
      if (index === 0) this.options.onOpenDashboard()
      else if (index === 1) this.options.onOpenSettings()
    })

    try {
      n.show()
    } catch (err) {
      logger.warn('AlertPresenter: show failed', err)
    }

    if (prefs.soundEnabled && alert.severity !== 'low') {
      try {
        shell.beep()
      } catch {
        // ignore
      }
    }
  }
}
