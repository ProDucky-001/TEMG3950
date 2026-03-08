import 'dotenv/config'
import { app, ipcMain, dialog } from 'electron'
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
import { FeedbackManager } from './managers/FeedbackManager'
import { loadStore } from './storeLoader'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { Settings } from '../shared/types'
import type { ContentSource } from '../shared/ai-detection-types'

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
let backgroundServiceManager: BackgroundServiceManager

async function init() {
  const Store = await loadStore()
  settingsManager = new SettingsManager(Store)
  const windowStateStore = new WindowStateStore(Store)
  windowManager = new WindowManager(settingsManager, windowStateStore)
  alertManager = new AlertManager(Store, {
    getSettings: () => settingsManager.getSettings(),
    onOpenDashboard: () => windowManager.openDashboard(),
    onOpenSettings: () => windowManager.openSettings(),
    onAlertPushed: (alert) => {
      const win = windowManager.getDashboardWindow()
      win?.webContents?.send('scamshield:alert-pushed', alert)
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
  })
  monitoringManager = new MonitoringManager(settingsManager, alertManager, linkScanner)
  trayManager = new TrayManager(windowManager, settingsManager, monitoringManager)

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
    return enabled
  })
  ipcMain.handle(IPC_CHANNELS.MONITORING_STATUS, () =>
    monitoringManager.getStatus()
  )

  ipcMain.handle(IPC_CHANNELS.LINK_SCAN, (_e, url: string) => {
    if (typeof url !== 'string') return Promise.reject(new Error('Invalid URL'))
    return linkScanner.scan(url)
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

app.whenReady().then(init)

app.on('window-all-closed', () => {
  // Tray app: keep running when all windows are closed (user can reopen from tray)
  if (process.platform === 'darwin') {
    app.dock?.hide?.()
  }
})
