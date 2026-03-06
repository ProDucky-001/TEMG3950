// Shared constants
import type { Settings } from './types'

export const DEFAULT_APPS: { id: string; name: string }[] = [
  { id: 'gmail', name: 'Gmail' },
  { id: 'whatsapp', name: 'WhatsApp' },
  { id: 'messages', name: 'Messages' },
  { id: 'outlook', name: 'Outlook' },
  { id: 'slack', name: 'Slack' },
  { id: 'telegram', name: 'Telegram' },
  { id: 'discord', name: 'Discord' },
]

export const DEFAULT_SETTINGS: Settings = {
  monitoringEnabled: true,
  monitoredApps: DEFAULT_APPS.map((app) => ({
    ...app,
    enabled: true,
  })),
  alertPreferences: {
    soundEnabled: true,
    notificationType: 'banner',
    desktopNotifications: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    focusModeEnabled: false,
  },
  sensitivity: 'medium',
  launchAtStartup: false,
  minimizeToTray: true,
  closeToTray: true,
}
