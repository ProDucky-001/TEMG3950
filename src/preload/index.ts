import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { Settings, Alert, Statistics } from '../shared/types'
import type { LinkDetectionResult } from '../shared/link-detection-types'
import type { AIDetectionResult, ContentSource } from '../shared/ai-detection-types'
import type { PrivacySummary } from '../shared/integration-types'

export interface ScamShieldAPI {
  // Settings
  getSettings: () => Promise<Settings>
  updateSettings: (settings: Partial<Settings>) => Promise<Settings>
  resetSettings: () => Promise<Settings>

  // Alerts
  getAlerts: () => Promise<Alert[]>
  clearAlerts: () => Promise<void>
  getAlertsLast30Days: () => Promise<Alert[]>
  getAlertStats: () => Promise<import('../shared/alert-types').AlertStats>
  exportAlertsJSON: () => Promise<string>
  exportAlertsCSV: () => Promise<string>
  subscribeAlertPushed: (callback: (alert: Alert) => void) => () => void

  // Statistics
  getStatistics: () => Promise<Statistics>

  // Monitoring
  toggleMonitoring: () => Promise<boolean>
  getMonitoringStatus: () => Promise<{ enabled: boolean }>

  // Link detection
  scanLink: (url: string) => Promise<LinkDetectionResult>

  // AI content detection
  scanContent: (input: { text: string; source?: ContentSource; metadata?: Record<string, unknown>; direction?: 'incoming' | 'outgoing' }) => Promise<AIDetectionResult>

  // App integration
  getPrivacySummary: () => Promise<PrivacySummary>
  checkAccessibility: () => Promise<{ granted: boolean; message?: string }>
  requestAccessibility: () => Promise<{ opened: boolean; message: string }>
  getAppMonitorStatus: () => Promise<{ monitoring: boolean; activeAppId: string | null; capabilities: { clipboard: boolean; activeApp: boolean; accessibility: boolean } }>

  // Windows
  openDashboard: () => Promise<void>
  openSettings: () => Promise<void>
  setDashboardAlwaysOnTop: (value: boolean) => Promise<void>
  getDashboardAlwaysOnTop: () => Promise<boolean>

  // App
  quit: () => Promise<void>
  setLaunchAtStartup: (enabled: boolean) => Promise<void>

  // User feedback
  reportFalsePositive: (alertId: string, kind: 'false_positive' | 'help_improve' | 'other', comment?: string) => Promise<void>
  getUsageStatsOptIn: () => Promise<boolean>
  setUsageStatsOptIn: (enabled: boolean) => Promise<void>

  // Screen capture
  getScreenCaptureStatus: () => Promise<{ status: 'granted' | 'denied' | 'unknown' }>
  getScreenCaptureInstructions: () => Promise<{ platform: string; steps: string }>

  // Permissions (unified)
  getPermissionsStatus: () => Promise<import('../shared/integration-types').PermissionStatus>
  openSystemPreferences: (section: 'screen' | 'accessibility') => Promise<boolean>

  // Detection (active window + email state)
  getDetectionState: () => Promise<import('../shared/detection-types').DetectionState>
  onDetectionStateChange: (callback: (state: import('../shared/detection-types').DetectionState) => void) => () => void
  getDetectionSettings: () => Promise<import('../shared/detection-types').DetectionSettings>
  updateDetectionSettings: (settings: import('../shared/detection-types').DetectionSettings) => Promise<void>
}

const api: ScamShieldAPI = {
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  updateSettings: (settings) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, settings),
  resetSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_RESET),

  getAlerts: () => ipcRenderer.invoke(IPC_CHANNELS.ALERTS_GET),
  clearAlerts: () => ipcRenderer.invoke(IPC_CHANNELS.ALERTS_CLEAR),
  getAlertsLast30Days: () => ipcRenderer.invoke(IPC_CHANNELS.ALERTS_GET_LAST_30_DAYS),
  getAlertStats: () => ipcRenderer.invoke(IPC_CHANNELS.ALERTS_GET_STATS),
  exportAlertsJSON: () => ipcRenderer.invoke(IPC_CHANNELS.ALERTS_EXPORT_JSON),
  exportAlertsCSV: () => ipcRenderer.invoke(IPC_CHANNELS.ALERTS_EXPORT_CSV),
  subscribeAlertPushed: (callback: (alert: Alert) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, alert: Alert) => callback(alert)
    ipcRenderer.on('scamshield:alert-pushed', handler)
    return () => ipcRenderer.removeListener('scamshield:alert-pushed', handler)
  },

  getStatistics: () => ipcRenderer.invoke(IPC_CHANNELS.STATS_GET),

  toggleMonitoring: () => ipcRenderer.invoke(IPC_CHANNELS.MONITORING_TOGGLE),
  getMonitoringStatus: () => ipcRenderer.invoke(IPC_CHANNELS.MONITORING_STATUS),

  scanLink: (url: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.LINK_SCAN, url),

  scanContent: (input: { text: string; source?: ContentSource; metadata?: Record<string, unknown>; direction?: 'incoming' | 'outgoing' }) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONTENT_SCAN, input),

  getPrivacySummary: () => ipcRenderer.invoke(IPC_CHANNELS.INTEGRATION_PRIVACY_SUMMARY),
  checkAccessibility: () => ipcRenderer.invoke(IPC_CHANNELS.INTEGRATION_ACCESSIBILITY_CHECK),
  requestAccessibility: () => ipcRenderer.invoke(IPC_CHANNELS.INTEGRATION_ACCESSIBILITY_REQUEST),
  getAppMonitorStatus: () => ipcRenderer.invoke(IPC_CHANNELS.INTEGRATION_APP_MONITOR_STATUS),

  openDashboard: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_OPEN_DASHBOARD),
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_OPEN_SETTINGS),
  setDashboardAlwaysOnTop: (value: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP, value),
  getDashboardAlwaysOnTop: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_ALWAYS_ON_TOP),

  quit: () => ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT),
  setLaunchAtStartup: (enabled) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_LAUNCH_AT_STARTUP, enabled),

  reportFalsePositive: (alertId: string, kind: 'false_positive' | 'help_improve' | 'other', comment?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FEEDBACK_REPORT_FALSE_POSITIVE, alertId, kind, comment),
  getUsageStatsOptIn: () => ipcRenderer.invoke(IPC_CHANNELS.FEEDBACK_GET_OPT_IN),
  setUsageStatsOptIn: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.FEEDBACK_SET_OPT_IN, enabled),

  getScreenCaptureStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SCREEN_CAPTURE_STATUS),
  getScreenCaptureInstructions: () => ipcRenderer.invoke(IPC_CHANNELS.SCREEN_CAPTURE_INSTRUCTIONS),

  getPermissionsStatus: () => ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_GET_ALL),
  openSystemPreferences: (section: 'screen' | 'accessibility') =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_OPEN_SYSTEM_PREFS, section),

  getDetectionState: () => ipcRenderer.invoke(IPC_CHANNELS.DETECTION_GET_STATE),
  onDetectionStateChange: (callback: (state: import('../shared/detection-types').DetectionState) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, state: import('../shared/detection-types').DetectionState) => callback(state)
    ipcRenderer.on(IPC_CHANNELS.DETECTION_STATE_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DETECTION_STATE_CHANGED, handler)
  },
  getDetectionSettings: () => ipcRenderer.invoke(IPC_CHANNELS.DETECTION_GET_SETTINGS),
  updateDetectionSettings: (settings: import('../shared/detection-types').DetectionSettings) =>
    ipcRenderer.invoke(IPC_CHANNELS.DETECTION_UPDATE_SETTINGS, settings),
}

contextBridge.exposeInMainWorld('scamshield', api)

declare global {
  interface Window {
    scamshield: ScamShieldAPI
  }
}
