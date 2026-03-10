import type { SupportedAppId } from '../../shared/integration-types'

const APP_NAME_TO_ID: Record<string, SupportedAppId> = {
  safari: 'safari',
  'safari browser': 'safari',
  'google chrome': 'chrome',
  chrome: 'chrome',
  'microsoft edge': 'chrome',
  whatsapp: 'whatsapp',
  telegram: 'telegram',
  discord: 'discord',
  messages: 'messages',
  'apple mail': 'generic',
  mail: 'generic',
  outlook: 'outlook',
  'microsoft outlook': 'outlook',
  slack: 'slack',
  'gmail': 'gmail',
}

export function getAppIdFromProcessName(name: string): SupportedAppId | null {
  if (!name || typeof name !== 'string') return null
  const normalized = name.toLowerCase().trim()
  return APP_NAME_TO_ID[normalized] ?? null
}

export function getContentSourceType(appId: SupportedAppId): 'email' | 'messaging' | 'browser' | 'clipboard' {
  if (appId === 'gmail' || appId === 'outlook' || appId === 'generic') return 'email'
  if (['whatsapp', 'telegram', 'discord', 'messages', 'slack'].includes(appId)) return 'messaging'
  if (['safari', 'chrome'].includes(appId)) return 'browser'
  return 'clipboard'
}
