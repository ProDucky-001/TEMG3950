import 'dotenv/config'
import { app, BrowserWindow, ipcMain, systemPreferences, dialog, shell } from 'electron'
import { TrayManager } from './managers/TrayManager'
import { WindowManager } from './managers/WindowManager'
import { WindowStateStore } from './managers/WindowStateStore'
import { BackgroundServiceManager } from './managers/BackgroundServiceManager'
import { SettingsManager } from './managers/SettingsManager'
import { AlertManager } from './managers/AlertManager'
import { MonitoringManager } from './managers/MonitoringManager'
import { ScamDatabase, LinkScanner, ContentScanner } from './services'
import { classifyAudioFile } from './services/VoiceClassifierService'
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
import { writePageContentLog } from './services/pageContentDebugLog'
import { isEmailUrl } from './detection/EmailPatterns'
import fs from 'fs'
import path from 'path'
import http from 'http'

// Mitigate macOS Electron/Chromium cosmetic errors during shutdown:
// task_policy_set, bootstrap_look_up, rendezvous
app.commandLine.appendSwitch('disable-task-permission-policy')
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('disable-background-timer-throttling')
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
}

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
            win.webContents.send(IPC_CHANNELS.SCAM_ALERT, alert)
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
  detectionManager.start()
  screenCaptureManager.start()

  // Local server for extension to send DATA_RECORDED (so overlay debug log can show it)
  startDataRecordedServer()

  // In development, open the dashboard so something visible appears (tray-only is easy to miss)
  const isDev = process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_VITE_DEV_SERVER_URL
  if (isDev) {
    windowManager.openDashboard()
  }

  if (process.platform === 'darwin') {
    setTimeout(() => {
      showAccessibilityDialogIfBinaryReturnedNull().catch(() => {})
    }, 3500)
  }

  // Mark as quitting when app is about to quit (tray Quit or app.quit()); close handler then allows real close
  app.on('before-quit', () => {
    windowManager.setQuitting(true)
    // Stop overlay and capture first so overlay is hidden/destroyed before other teardown
    screenCaptureManager.stop()
    detectionManager.stop()
    appMonitorManager.stopMonitoring()
    monitoringManager.stop()
    windowManager.closeAll()
  })

  // will-quit: close HTTP server; avoid forcing process.exit to prevent task_policy_set errors
  app.on('will-quit', (e) => {
    if (dataRecordedServer) {
      dataRecordedServer.close()
      dataRecordedServer = null
    }
  })

  // Handle Ctrl+C (SIGINT) and kill (SIGTERM). Let app.quit() run so Electron tears down
  // child processes cleanly; avoid process.exit() to prevent "bootstrap_look_up Unknown service name" / "parent died?" on macOS.
  let shutdownHandled = false
  const handleSIGINT = () => {
    if (shutdownHandled) return
    shutdownHandled = true
    logger.info('[ScamShield] Received SIGINT, shutting down...')
    windowManager.setQuitting(true)
    screenCaptureManager.stop()
    detectionManager.stop()
    appMonitorManager.stopMonitoring()
    monitoringManager.stop()
    windowManager.closeAll()
    app.quit()
  }
  const handleSIGTERM = () => {
    if (shutdownHandled) return
    shutdownHandled = true
    logger.info('[ScamShield] Received SIGTERM, shutting down...')
    windowManager.setQuitting(true)
    screenCaptureManager.stop()
    detectionManager.stop()
    appMonitorManager.stopMonitoring()
    monitoringManager.stop()
    windowManager.closeAll()
    app.quit()
  }
  process.on('SIGINT', handleSIGINT)
  process.on('SIGTERM', handleSIGTERM)
}

const DATA_RECORDED_PORT = 8765
let dataRecordedServer: http.Server | null = null

function handleDataRecorded(payload: { url?: string; length?: number; timestamp?: number; content?: string }): void {
  const line = `DATA_RECORDED url=${payload.url ?? ''} length=${payload.length ?? 0} ts=${payload.timestamp ?? 0}\n`
  try {
    const userData = app.getPath('userData')
    const logPath = path.join(userData, 'logs.txt')
    fs.appendFileSync(logPath, line)
  } catch (err) {
    logger.warn('Failed to append to logs.txt', err)
  }
  const debugLine = `DATA_RECORDED: ${(payload.url ?? '').substring(0, 50)} (${payload.length ?? 0} chars)`
  screenCaptureManager.sendDebugLogEntry(debugLine)
  if (payload.url != null && payload.url.trim() !== '') {
    screenCaptureManager.setExtensionTabState(payload.url, true)
  }
  // Only log page content on email tabs; extension is the primary source (more accurate than OCR)
  if (
    payload.content != null &&
    payload.content.trim() !== '' &&
    payload.url != null &&
    payload.url.trim() !== '' &&
    isEmailUrl(payload.url)
  ) {
    writePageContentLog({
      source: 'extension',
      url: payload.url ?? undefined,
      timestamp: payload.timestamp ?? Date.now(),
      content: payload.content,
    })
  }
}

function startDataRecordedServer(): void {
  if (dataRecordedServer) return
  dataRecordedServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/data-recorded') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        try {
          const payload = JSON.parse(body) as { url?: string; length?: number; timestamp?: number; content?: string }
          handleDataRecorded(payload)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch {
          res.writeHead(400)
          res.end()
        }
      })
    } else if (req.method === 'POST' && req.url === '/tab-state') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        try {
          const payload = JSON.parse(body) as { url?: string; isEmail?: boolean }
          screenCaptureManager.setExtensionTabState(payload.url ?? null, payload.isEmail === true)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch {
          res.writeHead(400)
          res.end()
        }
      })
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  dataRecordedServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(
        'DATA_RECORDED server: port 8765 already in use. Quit any other ScamShield instance, or run: lsof -i :8765'
      )
      if (dataRecordedServer) {
        dataRecordedServer.close()
        dataRecordedServer = null
      }
    } else {
      logger.warn('DATA_RECORDED server error', err.message)
    }
  })
  dataRecordedServer.listen(
    { port: DATA_RECORDED_PORT, host: '127.0.0.1', reuseAddress: true },
    () => {
      logger.debug('[ScamShield] DATA_RECORDED server listening on 127.0.0.1:' + DATA_RECORDED_PORT)
    }
  )
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
  ipcMain.handle(IPC_CHANNELS.MONITORING_TOGGLE, async () => {
    const enabled = monitoringManager.toggle()
    if (enabled) {
      monitoringManager.stop()
      await monitoringManager.start()
      appMonitorManager.startMonitoring()
    } else {
      monitoringManager.stop()
      appMonitorManager.stopMonitoring()
    }
    try {
      const win = windowManager.getDashboardWindow()
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.STATUS_UPDATE, { enabled })
      }
    } catch (err) {
      logger.debug('IPC: failed to send status update', err)
    }
    return enabled
  })
  ipcMain.handle(IPC_CHANNELS.MONITORING_STATUS, () =>
    monitoringManager.getStatus()
  )

  ipcMain.handle(IPC_CHANNELS.LINK_SCAN, (_e, url: string) => {
    if (typeof url !== 'string') return Promise.reject(new Error('Invalid URL'))
    return linkScanner.scan(url, { debugContext: { isEmail: false, source: 'manual' } }).then((result) => {
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

  ipcMain.handle(IPC_CHANNELS.VOICE_CLASSIFY, async () => {
    const win = windowManager.getDashboardWindow() ?? undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Select an audio file to classify',
      filters: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a'] },
        { name: 'All files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (canceled || filePaths.length === 0) return null
    return classifyAudioFile(filePaths[0])
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

  // Phase 6: capture:start (renderer requests immediate capture)
  ipcMain.handle(IPC_CHANNELS.CAPTURE_START, () => {
    try {
      return screenCaptureManager.requestCaptureOnce()
    } catch (err) {
      logger.debug('IPC: capture:start failed', err)
      return false
    }
  })

  // DATA_RECORDED: from extension (or renderer); append to logs.txt and update overlay debug log
  ipcMain.handle('data-recorded', (_e, payload: { url?: string; length?: number; timestamp?: number }) => {
    handleDataRecorded(payload ?? {})
  })

  // Phase 6: alert:dismiss
  ipcMain.on(IPC_CHANNELS.ALERT_DISMISS, (_e, _payload?: unknown) => {
    // Optional: log or update state when user dismisses in-app alert
  })

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
        win.webContents.send(IPC_CHANNELS.WINDOW_UPDATE, payload)
        if (state.status === 'detected') {
          win.webContents.send(IPC_CHANNELS.EMAIL_DETECTED, payload)
        }
      } catch (err) {
        logger.debug('IPC: failed to send detection state', err)
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
  // On macOS, keep the app running in the background (tray/dock)
  if (process.platform !== 'darwin') {
    app.quit()
  }
  if (process.platform === 'darwin') {
    app.dock?.hide?.()
  }
})

app.on('activate', () => {
  // On macOS, re-create or show window when dock icon is clicked
  if (process.platform !== 'darwin') return
  if (BrowserWindow.getAllWindows().length === 0) {
    windowManager.openDashboard()
  } else {
    const existing = windowManager.getDashboardWindow()
    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
    } else {
      windowManager.openDashboard()
    }
  }
})
