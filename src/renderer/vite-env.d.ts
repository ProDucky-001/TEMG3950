/// <reference types="vite/client" />

interface Window {
  scamshield?: {
    getSettings: () => Promise<import('../shared/types').Settings>
    updateSettings: (settings: Partial<import('../shared/types').Settings>) => Promise<import('../shared/types').Settings>
    resetSettings: () => Promise<import('../shared/types').Settings>
    getAlerts: () => Promise<import('../shared/types').Alert[]>
    clearAlerts: () => Promise<void>
    getAlertsLast30Days: () => Promise<import('../shared/types').Alert[]>
    getAlertStats: () => Promise<import('../shared/alert-types').AlertStats>
    exportAlertsJSON: () => Promise<string>
    exportAlertsCSV: () => Promise<string>
    subscribeAlertPushed: (callback: (alert: import('../shared/types').Alert) => void) => () => void
    getStatistics: () => Promise<import('../shared/types').Statistics>
    toggleMonitoring: () => Promise<boolean>
    getMonitoringStatus: () => Promise<{ enabled: boolean }>
    scanLink: (url: string) => Promise<import('../shared/link-detection-types').LinkDetectionResult>
    scanContent: (input: { text: string; source?: import('../shared/ai-detection-types').ContentSource; metadata?: Record<string, unknown>; direction?: 'incoming' | 'outgoing' }) => Promise<import('../shared/ai-detection-types').AIDetectionResult>
    getPrivacySummary: () => Promise<import('../shared/integration-types').PrivacySummary>
    checkAccessibility: () => Promise<{ granted: boolean; message?: string }>
    requestAccessibility: () => Promise<{ opened: boolean; message: string }>
    getAppMonitorStatus: () => Promise<{ monitoring: boolean; activeAppId: string | null; capabilities: { clipboard: boolean; activeApp: boolean; accessibility: boolean } }>
    openDashboard: () => Promise<void>
    openSettings: () => Promise<void>
    quit: () => Promise<void>
    setLaunchAtStartup: (enabled: boolean) => Promise<void>
  }
}
