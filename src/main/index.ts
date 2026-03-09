import { app, ipcMain, systemPreferences, dialog, shell } from 'electron'
import { TrayManager } from './managers/TrayManager'
import { WindowManager } from './managers/WindowManager'
import { WindowStateStore } from './managers/WindowStateStore'
import { BackgroundServiceManager } from './managers/BackgroundServiceManager'
import { SettingsManager } from './managers/SettingsManager'
import { AlertManager } from './managers/AlertManager'
import { MonitoringManager } from './managers/MonitoringManager'
import { ScamDatabase, LinkScanner, ContentScanner } from './services'
import { SystemEventListeners } from './services/SystemEventListeners'
import { StartupManager } from './services/StartupManager'
import { ResourceManager } from './services/ResourceManager'
import { UpdateChecker } from './services/UpdateChecker'
import { AppMonitorManager } from './integration'
import { ScreenCaptureManager } from './managers/ScreenCaptureManager'
import { DetectionManager } from './managers/DetectionManager'
import { FeedbackManager } from './managers/FeedbackManager'
import { loadStore } from './storeLoader'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { Settings } from '../shared/types'
import type { ContentSource } from '../shared/ai-detection-types'
import { writeErrorToLog } from './services/ErrorLogWriter'
import { PermissionManager } from './services/PermissionManager'
import { logger } from './services/logger'

// Disable GPU acceleration for compatibility
app.disableHardwareAcceleration()

let trayManager: TrayManager
let windowManager: WindowManager
let settingsManager: SettingsManager
let alertManager: AlertManager
let monitoringManager: MonitoringManager
let linkScanner: LinkScanner
let contentScanner: ContentScanner
let appMonitorManager: AppMonitorManager
let screenCaptureManager: ScreenCaptureManager
let detectionManager: DetectionManager
let backgroundServiceManager: BackgroundServiceManager
let permissionManager: PermissionManager

/** Install global exception handlers; call after app is ready (userData path available). */
function installGlobalErrorHandlers(): void {
  const userDataPath = app.getPath('userData')

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err)
    writeErrorToLog(userDataPath, 'uncaughtException', err)
    try {
      dialog.showErrorBox(
        'ScamShield Error',
        `An unexpected error occurred. Details have been saved to ${userDataPath}/main-errors.log`
      )
    } catch {
      // ignore if dialog fails
    }
    // Do not exit; allow app to keep running for background monitoring
  })

  process.on('unhandledRejection', (reason, promise) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    logger.error('Unhandled rejection:', err)
    writeErrorToLog(userDataPath, 'unhandledRejection', err)
    // Do not exit; allow app to keep running
  })
}

/** Only show the delayed accessibility dialog once per app run, and only when we've verified permission is not granted. */
let accessibilityDialogShownThisSession = false

/** Request screen recording permission (triggers macOS dialog if needed) and verify with desktopCapturer. */
async function initScreenCapture(): Promise<void> {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return
  const granted = permissionManager.checkScreenRecording()
  if (granted) return
  logger.warn(
    'Screen recording permission not granted. Open System Settings → Privacy & Security → Screen Recording and enable for this app, then restart.'
  )
  const result = await permissionManager.requestScreenRecording()
  if (!result.granted && result.message) {
    logger.warn('Screen recording:', result.message)
  }
}

async function ensureAccessibilityPermission(): Promise<boolean> {
  if (process.platform !== 'darwin') return true
  try {
    if (permissionManager.checkAccessibility()) return true
    await permissionManager.showAccessibilityDialog()
    return permissionManager.checkAccessibility()
  } catch (err) {
    logger.warn('Accessibility check failed:', err)
    return false
  }
}

/** Call after init when on macOS: if active-win has ever failed AND accessibility is still not granted, show the dialog once. */
async function showAccessibilityDialogIfBinaryReturnedNull(): Promise<void> {
  if (process.platform !== 'darwin') return
  if (accessibilityDialogShownThisSession) return
  const binaryEverFailed = detectionManager.hasActiveWindowBinaryEverFailed()
  const trusted = permissionManager.checkAccessibility()
  if (trusted) return
  if (!binaryEverFailed) return
  accessibilityDialogShownThisSession = true
  try {
    systemPreferences.isTrustedAccessibilityClient(true)
  } catch {
    // ignore
  }
  const parent = windowManager.getDashboardWindow()
  if (!parent || parent.isDestroyed()) {
    windowManager.openDashboard()
  }
  const win = windowManager.getDashboardWindow()
  const opts = {
    type: 'warning' as const,
    title: 'ScamShield — Window Detection Not Working',
    message: 'Accessibility permission is required.',
    detail:
      `ScamShield uses a helper that runs inside Electron. On macOS (especially Apple Silicon), adding the .app alone sometimes isn't enough.\n\n` +
      `1. Open System Settings → Privacy & Security → Accessibility.\n` +
      `2. If "Electron" is already in the list, remove it (minus), then add it again.\n` +
      `3. Click + and add Electron. Use Cmd+Shift+G and go to:\n   [your project]/node_modules/electron/dist\n   Select "Electron.app". If it still fails, try adding the executable inside the app:\n   [your project]/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron\n` +
      `4. Turn the toggle ON for Electron.\n` +
      `5. Fully quit ScamShield (tray menu → Quit), then start it again with npm run dev.`,
    buttons: ['Open System Settings', 'OK'],
    defaultId: 0,
  }
  const { response } = win && !win.isDestroyed()
    ? await dialog.showMessageBox(win, opts)
    : await dialog.showMessageBox(opts)
  if (response === 0) {
    permissionManager.openSystemPreferences('accessibility')
  }
}

async function init() {
  try {
    await initInternal()
  } catch (err) {
    console.error('[ScamShield] Init error:', err)
    try {
      dialog.showErrorBox(
        'ScamShield failed to start',
        err instanceof Error ? err.message : String(err)
      )
    } catch {
      // ignore
    }
    throw err
  }
}

async function initInternal() {
  installGlobalErrorHandlers()
  permissionManager = new PermissionManager({ appName: 'ScamShield' })

  let accessibilityGranted = false
  try {
    accessibilityGranted = await ensureAccessibilityPermission()
  } catch (err) {
    logger.warn('Startup accessibility check failed:', err)
  }
  // #region agent log
  fetch('http://127.0.0.1:7799/ingest/2f9d4b64-93fa-4b9d-8d61-3e63f5789b0d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b6709'},body:JSON.stringify({sessionId:'2b6709',location:'index.ts:init',message:'accessibility after ensure',data:{accessibilityGranted,platform:process.platform},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  if (!accessibilityGranted) {
    logger.warn('Accessibility permission not granted — active window detection will be limited')
  } else {
    logger.info('Accessibility permission granted')
  }

  await initScreenCapture()

  const Store = await loadStore()
  settingsManager = new SettingsManager(Store)
  const windowStateStore = new WindowStateStore(Store)
  windowManager = new WindowManager(settingsManager, windowStateStore)
  alertManager = new AlertManager(Store, {
    getSettings: () => settingsManager.getSettings(),
    onOpenDashboard: () => windowManager.openDashboard(),
    onOpenSettings: () => windowManager.openSettings(),
    onAlertPushed: (alert) => {
      windowManager.openDashboard({ focus: false })
      const win = windowManager.getDashboardWindow()
      if (win && !win.isDestroyed()) {
        const send = () => {
          try {
            win.webContents.send('scamshield:alert-pushed', alert)
          } catch {
            // window may be destroyed
          }
        }
        if (win.webContents.isLoading()) {
          win.webContents.once('did-finish-load', send)
        } else {
          send()
        }
      }
      // Do not focus the dashboard — user stays in their current app; they can click the notification to open it
    },
  })
  const scamDb = new ScamDatabase(Store)
  linkScanner = new LinkScanner(scamDb)
  contentScanner = new ContentScanner()
  appMonitorManager = new AppMonitorManager({
    settingsManager,
    alertManager,
    linkScanner,
    contentScanner,
    onLinkScanned: (riskScore) => monitoringManager.recordScan(riskScore),
  })
  monitoringManager = new MonitoringManager(settingsManager, alertManager, linkScanner)
  trayManager = new TrayManager(windowManager, settingsManager, monitoringManager, permissionManager)

  detectionManager = new DetectionManager()
  if (process.platform === 'darwin') {
    detectionManager.setOnAccessibilityBinaryFailed(() => {
      showAccessibilityDialogIfBinaryReturnedNull().catch(() => {})
    })
  }

  screenCaptureManager = new ScreenCaptureManager({
    settingsManager,
    alertManager,
    linkScanner,
    contentScanner,
    onLinkScanned: (riskScore) => monitoringManager.recordScan(riskScore),
    detectionManager,
  })

  const startupManager = new StartupManager(settingsManager, Store)
  startupManager.syncFromSettings()

  const systemEvents = new SystemEventListeners()
  const resourceManager = new ResourceManager()
  const updateChecker = new UpdateChecker({ notifyOnly: true })

  backgroundServiceManager = new BackgroundServiceManager({
    trayManager,
    systemEvents,
    startupManager,
    resourceManager,
    updateChecker,
    onSleep: () => {},
    onWake: () => {},
  })
  backgroundServiceManager.start()

  const feedbackManager = new FeedbackManager(Store)
  setupIpcHandlers(startupManager, feedbackManager)
  trayManager.create()
  await monitoringManager.start()
  appMonitorManager.startMonitoring()
  // #region agent log
  fetch('http://127.0.0.1:7799/ingest/2f9d4b64-93fa-4b9d-8d61-3e63f5789b0d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b6709'},body:JSON.stringify({sessionId:'2b6709',location:'index.ts:before detectionManager.start',message:'trusted right before monitor start',data:{trusted:process.platform==='darwin'?systemPreferences.isTrustedAccessibilityClient(false):null},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  detectionManager.start()
  screenCaptureManager.start()

  if (process.platform === 'darwin') {
    setTimeout(() => {
      showAccessibilityDialogIfBinaryReturnedNull().catch(() => {})
    }, 3500)
  }

  app.on('before-quit', () => {
    windowManager.setQuitting(true)
    screenCaptureManager.stop()
    detectionManager.stop()
    appMonitorManager.stopMonitoring()
    monitoringManager.stop()
    windowManager.closeAll()
  })

  app.on('will-quit', () => {
    process.exit(0)
  })
}
function setupIpcHandlers(startupManager: StartupManager, feedbackManager: FeedbackManager): void {
  // Settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => settingsManager.getSettings())
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_e, settings: Partial<Settings>) =>
    settingsManager.updateSettings(settings)
  )
  ipcMain.handle(IPC_CHANNELS.SETTINGS_RESET, () => settingsManager.resetSettings())

  // Alerts
  ipcMain.handle(IPC_CHANNELS.ALERTS_GET, () => alertManager.getAlerts())
  ipcMain.handle(IPC_CHANNELS.ALERTS_CLEAR, () => alertManager.clearAlerts())
  ipcMain.handle(IPC_CHANNELS.ALERTS_GET_LAST_30_DAYS, () => alertManager.getAlertsLast30Days())
  ipcMain.handle(IPC_CHANNELS.ALERTS_GET_STATS, () => alertManager.getAlertStats())
  ipcMain.handle(IPC_CHANNELS.ALERTS_EXPORT_JSON, () => alertManager.exportAlertsJSON())
  ipcMain.handle(IPC_CHANNELS.ALERTS_EXPORT_CSV, () => alertManager.exportAlertsCSV())

  // Statistics
  ipcMain.handle(IPC_CHANNELS.STATS_GET, () => monitoringManager.getStatistics())

  // Monitoring
  ipcMain.handle(IPC_CHANNELS.MONITORING_TOGGLE, () =>
    monitoringManager.toggle()
  )
  ipcMain.handle(IPC_CHANNELS.MONITORING_STATUS, () =>
    monitoringManager.getStatus()
  )

  ipcMain.handle(IPC_CHANNELS.LINK_SCAN, (_e, url: string) => {
    if (typeof url !== 'string') return Promise.reject(new Error('Invalid URL'))
    return linkScanner.scan(url).then((result) => {
      monitoringManager.recordScan(result.riskScore)
      return result
    })
  })

  ipcMain.handle(IPC_CHANNELS.CONTENT_SCAN, (_e, input: { text: string; source?: ContentSource; metadata?: Record<string, unknown>; direction?: 'incoming' | 'outgoing' }) => {
    if (!input || typeof input.text !== 'string') return Promise.reject(new Error('Invalid content scan input'))
    return contentScanner.scan({
      text: input.text,
      source: input.source,
      metadata: input.metadata,
      direction: input.direction,
    })
  })

  ipcMain.handle(IPC_CHANNELS.INTEGRATION_PRIVACY_SUMMARY, () =>
    appMonitorManager.getPrivacySummary()
  )
  ipcMain.handle(IPC_CHANNELS.INTEGRATION_ACCESSIBILITY_CHECK, () =>
    appMonitorManager.checkAccessibilityPermission()
  )
  ipcMain.handle(IPC_CHANNELS.INTEGRATION_ACCESSIBILITY_REQUEST, () =>
    appMonitorManager.requestAccessibilityPermission()
  )
  ipcMain.handle(IPC_CHANNELS.INTEGRATION_APP_MONITOR_STATUS, () => ({
    monitoring: appMonitorManager.isMonitoring(),
    activeAppId: appMonitorManager.getActiveAppId(),
    capabilities: appMonitorManager.getPlatformCapabilities(),
  }))

  // Screen capture (email OCR)
  ipcMain.handle(IPC_CHANNELS.SCREEN_CAPTURE_STATUS, () => ({
    status: screenCaptureManager.getPermissionStatus(),
  }))
  ipcMain.handle(IPC_CHANNELS.SCREEN_CAPTURE_INSTRUCTIONS, () =>
    screenCaptureManager.getPermissionInstructions()
  )

  // Detection (active window + email state)
  ipcMain.handle(IPC_CHANNELS.DETECTION_GET_STATE, () => detectionManager.getState())
  ipcMain.handle(IPC_CHANNELS.DETECTION_GET_SETTINGS, () => detectionManager.getDetectionSettings())
  ipcMain.handle(IPC_CHANNELS.DETECTION_UPDATE_SETTINGS, (_e, settings: { pollingIntervalMs?: number }) => {
    detectionManager.updateDetectionSettings(settings)
  })

  // Permissions
  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_GET_ALL, () => permissionManager.getAllStatus())
  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_OPEN_SYSTEM_PREFS, (_e, section: 'screen' | 'accessibility') => {
    return permissionManager.openSystemPreferences(section)
  })

  detectionManager.onStateChange((state) => {
    const win = windowManager.getDashboardWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      try {
        const payload = {
          ...state,
          lastChecked: state.lastChecked instanceof Date ? state.lastChecked.toISOString() : state.lastChecked,
        }
        win.webContents.send(IPC_CHANNELS.DETECTION_STATE_CHANGED, payload)
      } catch {
        // ignore
      }
    }
  })

  // Windows
  ipcMain.handle(IPC_CHANNELS.WINDOW_OPEN_DASHBOARD, () =>
    windowManager.openDashboard()
  )
  ipcMain.handle(IPC_CHANNELS.WINDOW_OPEN_SETTINGS, () =>
    windowManager.openSettings()
  )
  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP, (_e, value: boolean) => {
    windowManager.setDashboardAlwaysOnTop(!!value)
  })
  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_ALWAYS_ON_TOP, () =>
    windowManager.getDashboardAlwaysOnTop()
  )

  // App
  ipcMain.handle(IPC_CHANNELS.APP_QUIT, () => app.quit())
  ipcMain.handle(IPC_CHANNELS.APP_LAUNCH_AT_STARTUP, (_e, enabled: boolean) => {
    startupManager.setLaunchAtStartup(enabled)
    settingsManager.updateSettings({ launchAtStartup: enabled })
  })

  // User feedback
  ipcMain.handle(IPC_CHANNELS.FEEDBACK_REPORT_FALSE_POSITIVE, (_e, alertId: string, kind: 'false_positive' | 'help_improve' | 'other', comment?: string) => {
    if (typeof alertId !== 'string') return
    feedbackManager.reportFalsePositive(alertId, kind, comment)
  })
  ipcMain.handle(IPC_CHANNELS.FEEDBACK_GET_OPT_IN, () => feedbackManager.isUsageStatsOptIn())
  ipcMain.handle(IPC_CHANNELS.FEEDBACK_SET_OPT_IN, (_e, enabled: boolean) => {
    feedbackManager.setUsageStatsOptIn(!!enabled)
  })
}

app.whenReady().then(init).catch((err) => {
  console.error('[ScamShield] Fatal init error:', err)
  try {
    dialog.showErrorBox(
      'ScamShield failed to start',
      err instanceof Error ? err.message : String(err)
    )
  } catch {
    // ignore if dialog fails (e.g. no display)
  }
  process.exit(1)
})

app.on('window-all-closed', () => {
  // Tray app: keep running when all windows are closed on all platforms
  if (process.platform === 'darwin') {
    app.dock?.hide?.()
  }
  // Do not call app.quit(); tray keeps the app alive for background monitoring
})
