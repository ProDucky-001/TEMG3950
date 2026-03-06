import { app } from 'electron'
import type { StoreClass } from '../storeLoader'
import type { SettingsManager } from '../managers/SettingsManager'
import { logger } from './logger'

const STORE_KEY = 'scamshield-startup'

interface StartupStore {
  firstRunCompleted: boolean
  launchAtStartup: boolean
}

/**
 * Manages launch-at-startup and first-run state using Electron's login item settings.
 */
export class StartupManager {
  private store: InstanceType<StoreClass>

  constructor(private readonly settingsManager: SettingsManager, Store: StoreClass) {
    this.store = new Store({
      name: STORE_KEY,
      defaults: {
        firstRunCompleted: false,
        launchAtStartup: false,
      },
    }) as InstanceType<StoreClass>
  }

  isFirstRun(): boolean {
    return !this.store.get('firstRunCompleted')
  }

  setFirstRunCompleted(): void {
    this.store.set('firstRunCompleted', true)
  }

  isLaunchAtStartupEnabled(): boolean {
    try {
      return app.getLoginItemSettings().openAtLogin
    } catch {
      return this.store.get('launchAtStartup')
    }
  }

  setLaunchAtStartup(enabled: boolean): boolean {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
      })
      this.store.set('launchAtStartup', enabled)
      return true
    } catch (err) {
      logger.warn('StartupManager: setLaunchAtStartup failed', err)
      return false
    }
  }

  syncFromSettings(): void {
    const settings = this.settingsManager.getSettings()
    this.setLaunchAtStartup(settings.launchAtStartup ?? false)
  }
}
