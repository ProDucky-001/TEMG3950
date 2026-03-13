import { app, dialog } from 'electron'
import { logger } from './logger'

let autoUpdater: typeof import('electron-updater').autoUpdater | null = null

function getAutoUpdater(): typeof import('electron-updater').autoUpdater | null {
  if (autoUpdater != null) return autoUpdater
  try {
    const { autoUpdater: updater } = require('electron-updater')
    autoUpdater = updater
    return autoUpdater
  } catch {
    return null
  }
}

export interface UpdateCheckerOptions {
  allowAutoUpdate?: boolean
  notifyOnly?: boolean
}

/**
 * Checks for updates in the background using electron-updater when available.
 */
export class UpdateChecker {
  private allowAutoUpdate: boolean
  private notifyOnly: boolean

  constructor(options: UpdateCheckerOptions = {}) {
    this.allowAutoUpdate = options.allowAutoUpdate ?? false
    this.notifyOnly = options.notifyOnly ?? true
  }

  start(): void {
    const updater = getAutoUpdater()
    if (!updater) return
    updater.autoDownload = this.allowAutoUpdate && !this.notifyOnly
    updater.autoInstallOnAppQuit = this.allowAutoUpdate && !this.notifyOnly

    updater.on('update-available', (info: { version: string }) => {
      logger.info('UpdateChecker: update available', info.version)
      if (this.notifyOnly) {
        dialog.showMessageBox({
          type: 'info',
          title: 'Update Available',
          message: `ScamShield ${info.version} is available. Restart the app to update, or download from the website.`,
        }).catch(() => {})
      }
    })

    updater.on('update-not-available', () => {})

    updater.on('error', (err: Error) => {
      logger.warn('UpdateChecker: error', err.message)
    })

    this.checkForUpdates()
    const interval = 4 * 60 * 60 * 1000 // 4 hours
    setInterval(() => this.checkForUpdates(), interval)
  }

  checkForUpdates(): void {
    if (!app.isPackaged) return
    const updater = getAutoUpdater()
    if (!updater) return
    updater.checkForUpdates().catch((err: Error) => logger.warn('UpdateChecker: check failed', err.message))
  }
}
