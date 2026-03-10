import { app, Menu, Tray, nativeImage } from 'electron'
import path from 'path'
import type { WindowManager } from './WindowManager'
import type { SettingsManager } from './SettingsManager'
import type { MonitoringManager } from './MonitoringManager'
import type { ThreatStatus } from '../../shared/types'
import type { PermissionManager } from '../services/PermissionManager'

export class TrayManager {
  private tray: Tray | null = null
  private statusInterval: ReturnType<typeof setInterval> | null = null
  private windowManager: WindowManager
  private settingsManager: SettingsManager
  private monitoringManager: MonitoringManager
  private permissionManager: PermissionManager | null
  private currentStatus: ThreatStatus = 'safe'

  constructor(
    windowManager: WindowManager,
    settingsManager: SettingsManager,
    monitoringManager: MonitoringManager,
    permissionManager?: PermissionManager | null
  ) {
    this.windowManager = windowManager
    this.settingsManager = settingsManager
    this.monitoringManager = monitoringManager
    this.permissionManager = permissionManager ?? null
  }

  create(): void {
    const iconPath = this.getTrayIconPath('safe')
    const icon = nativeImage.createFromPath(iconPath)
    const resizedIcon = icon.resize({ width: 16, height: 16 })

    this.tray = new Tray(
      resizedIcon.isEmpty() ? this.createPlaceholderIcon() : resizedIcon
    )
    this.tray.setToolTip('ScamShield - Anti-scam protection active')

    this.updateContextMenu()
    this.tray.on('double-click', () => this.windowManager.openDashboard())
    if (process.platform !== 'darwin') {
      this.tray.on('click', () => this.windowManager.openDashboard())
    }

    this.statusInterval = setInterval(() => this.updateStatus(), 5000)
  }

  private getTrayIconPath(status: ThreatStatus): string {
    const basePath = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'icons')
      : path.join(app.getAppPath(), 'assets', 'icons')
    return path.join(basePath, `tray-${status}.png`)
  }

  private createPlaceholderIcon() {
    // Create a minimal 16x16 PNG (shield-like) when no icon file exists
    const size = 16
    const canvas = Buffer.alloc(size * size * 4)
    const green = [34, 197, 94, 255] // Safe green
    for (let i = 0; i < size * size; i++) {
      const x = i % size
      const y = Math.floor(i / size)
      const inShield = x >= 2 && x < 14 && y >= 2 && y < 14
      if (inShield) {
        canvas[i * 4] = green[0]
        canvas[i * 4 + 1] = green[1]
        canvas[i * 4 + 2] = green[2]
        canvas[i * 4 + 3] = green[3]
      }
    }
    return nativeImage.createFromBuffer(canvas, { width: size, height: size })
  }

  updateStatus(): void {
    const status = this.monitoringManager.getThreatStatus()
    if (status !== this.currentStatus) {
      this.currentStatus = status
      const iconPath = this.getTrayIconPath(status)
      const icon = nativeImage.createFromPath(iconPath)
      if (!icon.isEmpty()) {
        this.tray?.setImage(icon.resize({ width: 16, height: 16 }))
      }
      this.updateContextMenu()
    }
  }

  private updateContextMenu(): void {
    const monitoringStatus = this.monitoringManager.getStatus()

    const items: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'Open Dashboard',
        click: () => this.windowManager.openDashboard(),
      },
      {
        label: monitoringStatus.enabled ? 'Pause Monitoring' : 'Resume Monitoring',
        click: () => {
          this.monitoringManager.toggle()
          this.updateContextMenu()
        },
      },
      { type: 'separator' },
    ]

    if (this.permissionManager) {
      const status = this.permissionManager.getAllStatus()
      if (status.screen.canRequest) {
        items.push({
          label: status.screen.granted ? '✓ Screen Recording' : '⚠ Screen Recording — Not granted',
          click: status.screen.granted ? undefined : () => this.permissionManager?.showScreenRecordingDialog(),
        })
        if (!status.screen.granted) {
          items.push({
            label: 'Open System Settings (Screen Recording)',
            click: () => this.permissionManager?.openSystemPreferences('screen'),
          })
        }
      }
      if (status.accessibility.canRequest) {
        items.push({
          label: status.accessibility.granted ? '✓ Accessibility' : '⚠ Accessibility — Not granted',
          click: status.accessibility.granted ? undefined : () => this.permissionManager?.showAccessibilityDialog(),
        })
        if (!status.accessibility.granted) {
          items.push({
            label: 'Open System Settings (Accessibility)',
            click: () => this.permissionManager?.openSystemPreferences('accessibility'),
          })
        }
      }
      if (status.screen.canRequest || status.accessibility.canRequest) {
        items.push({ type: 'separator' })
      }
    }

    items.push(
      { label: 'Settings', click: () => this.windowManager.openSettings() },
      { type: 'separator' },
      { label: 'Quit ScamShield', click: () => app.quit() }
    )

    const contextMenu = Menu.buildFromTemplate(items)

    this.tray?.setContextMenu(contextMenu)

    const statusLabel =
      this.currentStatus === 'safe'
        ? 'Protected'
        : this.currentStatus === 'warning'
          ? 'Warning'
          : 'Threat detected'
    this.tray?.setToolTip(`ScamShield - ${statusLabel}`)
  }

  destroy(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval)
      this.statusInterval = null
    }
    this.tray?.destroy()
    this.tray = null
  }
}
