import { Notification } from 'electron'
import type { StoreClass } from '../storeLoader'
import type { Alert } from '../../shared/types'
import type { AlertPreferences } from '../../shared/types'
import { AlertPresenter } from './AlertPresenter'
import { AlertHistoryManager } from './AlertHistoryManager'
import type { AlertStats } from '../../shared/alert-types'
import { logger } from '../services/logger'

const MAX_ALERTS = 500

export interface AlertManagerOptions {
  onOpenDashboard: () => void
  onOpenSettings: () => void
  getSettings: () => { alertPreferences: AlertPreferences }
  onAlertPushed?: (alert: Alert) => void
}

export class AlertManager {
  private store: InstanceType<StoreClass>
  private readonly presenter: AlertPresenter
  private readonly historyManager: AlertHistoryManager
  private readonly getSettings: () => { alertPreferences: AlertPreferences }
  private readonly onAlertPushed?: (alert: Alert) => void

  constructor(Store: StoreClass, options: AlertManagerOptions) {
    this.getSettings = options.getSettings
    this.onAlertPushed = options.onAlertPushed
    this.store = new Store({
      name: 'scamshield-alerts',
      defaults: { alerts: [] },
    }) as InstanceType<StoreClass>
    this.presenter = new AlertPresenter({
      onOpenDashboard: options.onOpenDashboard,
      onOpenSettings: options.onOpenSettings,
      isQuietHours: () => this.isQuietHours(),
      isFocusMode: () => this.isFocusMode(),
    })
    this.historyManager = new AlertHistoryManager(() => this.getAlerts())
  }

  getAlerts(): Alert[] {
    return this.store.get('alerts')
  }

  addAlert(
    alert: Omit<Alert, 'id' | 'timestamp'>,
    prefs?: AlertPreferences
  ): Alert {
    const fullAlert: Alert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    }
    const alerts = this.store.get('alerts')
    const updated = [fullAlert, ...alerts].slice(0, MAX_ALERTS)
    this.store.set('alerts', updated)

    const effectivePrefs = prefs ?? this.getSettings().alertPreferences
    this.presenter.present(fullAlert, effectivePrefs)
    this.onAlertPushed?.(fullAlert)
    return fullAlert
  }

  clearAlerts(): void {
    this.store.set('alerts', [])
  }

  getAlertsLast30Days(): Alert[] {
    return this.historyManager.getAlertsLast30Days()
  }

  getAlertStats(): AlertStats {
    return this.historyManager.getStats()
  }

  exportAlertsJSON(): string {
    return this.historyManager.exportJSON()
  }

  exportAlertsCSV(): string {
    return this.historyManager.exportCSV()
  }

  private isQuietHours(): boolean {
    const prefs = this.getSettings().alertPreferences
    if (!prefs.quietHoursEnabled || !prefs.quietHoursStart || !prefs.quietHoursEnd) return false
    const now = new Date()
    const [sh, sm] = prefs.quietHoursStart.split(':').map(Number)
    const [eh, em] = prefs.quietHoursEnd.split(':').map(Number)
    const currentMins = now.getHours() * 60 + now.getMinutes()
    const startMins = sh * 60 + sm
    const endMins = eh * 60 + em
    if (startMins > endMins) return currentMins >= startMins || currentMins < endMins
    return currentMins >= startMins && currentMins < endMins
  }

  private isFocusMode(): boolean {
    return !!this.getSettings().alertPreferences.focusModeEnabled
  }
}
