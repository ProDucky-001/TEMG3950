/**
 * Application integration layer types for ScamShield.
 */

export type SupportedAppId =
  | 'gmail'
  | 'outlook'
  | 'whatsapp'
  | 'telegram'
  | 'discord'
  | 'messages'
  | 'slack'
  | 'safari'
  | 'chrome'
  | 'firefox'
  | 'generic'

export type ContentSourceType = 'email' | 'messaging' | 'browser' | 'clipboard'

export interface ExtractedContent {
  text: string
  format: 'plain' | 'html' | 'markdown'
  sourceType: ContentSourceType
  appId: SupportedAppId
  /** URLs found in content (never full message body in storage) */
  urls: string[]
  /** Sanitized snippet for analysis only (not persisted) */
  snippet?: string
}

export interface EmailContentContext {
  from?: string
  to?: string
  subject?: string
  /** Reply-To if present (spoofing check) */
  replyTo?: string
  /** Raw From header for display-name parsing */
  fromHeader?: string
}

export interface MessageContentContext {
  /** Whether content looks like a forward (e.g. "Forwarded" prefix) */
  isForward?: boolean
  /** Forward chain depth if detectable */
  forwardDepth?: number
  hasMedia?: boolean
}

export interface BrowserContentContext {
  url?: string
  title?: string
}

export type ContentContext =
  | { type: 'email'; email: EmailContentContext }
  | { type: 'messaging'; message: MessageContentContext }
  | { type: 'browser'; browser: BrowserContentContext }
  | { type: 'clipboard'; clipboard: Record<string, never> }

export interface IntegrationAnalysisResult {
  threatDetected: boolean
  riskScore: number
  reasons: string[]
  linkResults?: Array<{ url: string; riskScore: number }>
  recommendation: string
}

export type PlatformName = 'darwin' | 'win32' | 'linux'

export interface AccessibilityStatus {
  granted: boolean
  platform: PlatformName
  message?: string
}

export interface PrivacySummary {
  localOnly: boolean
  noContentStored: boolean
  optedOutApps: string[]
  monitoringActive: boolean
}

/** Permission status for tray/settings UI (screen recording, accessibility). */
export interface PermissionStatus {
  screen: { granted: boolean; canRequest: boolean; message?: string }
  accessibility: { granted: boolean; canRequest: boolean; message?: string }
}
