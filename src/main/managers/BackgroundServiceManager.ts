import { app } from 'electron'
import type { TrayManager } from './TrayManager'
import type { SystemEventListeners } from '../services/SystemEventListeners'
import type { StartupManager } from '../services/StartupManager'
import type { ResourceManager } from '../services/ResourceManager'
import type { UpdateChecker } from '../services/UpdateChecker'
import { logger } from '../services/logger'

export interface BackgroundServiceManagerOptions {
  trayManager: TrayManager
  systemEvents: SystemEventListeners
  startupManager: StartupManager
  resourceManager: ResourceManager
  updateChecker: UpdateChecker
  onSleep?: () => void
  onWake?: () => void
}

/**
 * Coordinates background operation: tray-only mode, sleep/wake, startup, and ensures
 * the app keeps running when windows are closed.
 */
export class BackgroundServiceManager {
  private readonly trayManager: TrayManager
  private readonly systemEvents: SystemEventListeners
  private readonly startupManager: StartupManager
  private readonly resourceManager: ResourceManager
  private readonly updateChecker: UpdateChecker
  private readonly onSleep?: () => void
  private readonly onWake?: () => void

  constructor(options: BackgroundServiceManagerOptions) {
    this.trayManager = options.trayManager
    this.systemEvents = options.systemEvents
    this.startupManager = options.startupManager
    this.resourceManager = options.resourceManager
    this.updateChecker = options.updateChecker
    this.onSleep = options.onSleep
    this.onWake = options.onWake
  }

  start(): void {
    this.systemEvents.start()
    this.systemEvents.on('sleep', () => this.onSleep?.())
    this.systemEvents.on('wake', () => this.onWake?.())

    this.resourceManager.start()

    this.startupManager.syncFromSettings()

    if (app.isPackaged) {
      this.updateChecker.start()
    }

    // window-all-closed and activate are handled in index.ts for macOS tray lifecycle
    app.on('before-quit', () => {
      this.systemEvents.stop()
      this.resourceManager.stop()
      this.trayManager.destroy()
    })

    logger.info('BackgroundServiceManager: started')
  }
}
