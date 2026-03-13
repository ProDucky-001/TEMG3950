import type { SettingsManager } from '../managers/SettingsManager'
import type { AlertManager } from '../managers/AlertManager'
import type { LinkScanner } from '../services/LinkScanner'
import type { ContentScanner } from '../services/ai-detection/ContentScanner'
import { PlatformSpecificManager } from './PlatformSpecificManager'
import { PrivacyManager } from './PrivacyManager'
import { ContentExtractor } from './ContentExtractor'
import { ApplicationIntegrator } from './ApplicationIntegrator'
import { getAppIdFromProcessName, getContentSourceType } from './appMapping'
import type { SupportedAppId } from '../../shared/integration-types'
import type { ContentContext } from '../../shared/integration-types'
import { logger } from '../services/logger'

const CLIPBOARD_POLL_INTERVAL_MS = 2000
const ACTIVE_APP_POLL_INTERVAL_MS = 3000
const BROWSER_URL_POLL_INTERVAL_MS = 5000
const MIN_CLIPBOARD_LENGTH_FOR_ANALYSIS = 10

export interface AppMonitorManagerOptions {
  settingsManager: SettingsManager
  alertManager: AlertManager
  linkScanner: LinkScanner
  contentScanner: ContentScanner
  /** Called when a link scan completes (e.g. from clipboard) to update stats */
  onLinkScanned?: (riskScore: number) => void
}

/**
 * Detects when supported apps are active, monitors clipboard for suspicious URLs,
 * tracks active window changes, and manages accessibility. Does not store message content.
 */
export class AppMonitorManager {
  private readonly platform: PlatformSpecificManager
  private readonly privacy: PrivacyManager
  private readonly extractor: ContentExtractor
  private readonly integrator: ApplicationIntegrator
  private readonly settingsManager: SettingsManager
  private readonly alertManager: AlertManager
  private readonly onLinkScanned?: (riskScore: number) => void
  private readonly linkScanner: LinkScanner

  private clipboardPollTimer: ReturnType<typeof setInterval> | null = null
  private activeAppPollTimer: ReturnType<typeof setInterval> | null = null
  private browserUrlPollTimer: ReturnType<typeof setInterval> | null = null
  private lastClipboardText = ''
  private lastClipboardHtml = ''
  private lastBrowserUrl: string | null = null
  private lastActiveAppId: SupportedAppId | null = null
  private powerUnsubscribe: (() => void) | null = null
  private suspended = false

  constructor(options: AppMonitorManagerOptions) {
    this.settingsManager = options.settingsManager
    this.alertManager = options.alertManager
    this.onLinkScanned = options.onLinkScanned
    this.linkScanner = options.linkScanner
    this.platform = new PlatformSpecificManager()
    this.privacy = new PrivacyManager(options.settingsManager)
    this.extractor = new ContentExtractor()
    this.integrator = new ApplicationIntegrator(options.linkScanner, options.contentScanner)
  }

  startMonitoring(): void {
    if (this.clipboardPollTimer || this.activeAppPollTimer || this.browserUrlPollTimer) return

    this.lastClipboardText = this.platform.getClipboardText()
    this.lastClipboardHtml = this.platform.getClipboardHtml()

    this.clipboardPollTimer = setInterval(() => this.pollClipboard(), CLIPBOARD_POLL_INTERVAL_MS)
    this.activeAppPollTimer = setInterval(() => this.pollActiveApp(), ACTIVE_APP_POLL_INTERVAL_MS)
    this.browserUrlPollTimer = setInterval(() => this.pollBrowserUrl(), BROWSER_URL_POLL_INTERVAL_MS)

    this.powerUnsubscribe = this.platform.onPowerStateChange((state) => {
      this.suspended = state === 'suspend'
    })

    logger.info('AppMonitorManager: monitoring started')
  }

  stopMonitoring(): void {
    if (this.clipboardPollTimer) {
      clearInterval(this.clipboardPollTimer)
      this.clipboardPollTimer = null
    }
    if (this.activeAppPollTimer) {
      clearInterval(this.activeAppPollTimer)
      this.activeAppPollTimer = null
    }
    if (this.browserUrlPollTimer) {
      clearInterval(this.browserUrlPollTimer)
      this.browserUrlPollTimer = null
    }
    this.powerUnsubscribe?.()
    this.powerUnsubscribe = null
    this.lastActiveAppId = null
    this.lastBrowserUrl = null
    logger.info('AppMonitorManager: monitoring stopped')
  }

  isMonitoring(): boolean {
    return this.clipboardPollTimer != null
  }

  async checkAccessibilityPermission(): Promise<{ granted: boolean; message?: string }> {
    return this.platform.checkAccessibilityPermission()
  }

  async requestAccessibilityPermission(): Promise<{ opened: boolean; message: string }> {
    return this.platform.requestAccessibilityPermission()
  }

  getPrivacySummary() {
    return this.privacy.getPrivacySummary(this.isMonitoring())
  }

  getPlatformCapabilities() {
    return this.platform.getCapabilities()
  }

  getActiveAppId(): SupportedAppId | null {
    return this.lastActiveAppId
  }

  private async pollActiveApp(): Promise<void> {
    if (this.suspended) return
    try {
      const app = await this.platform.getActiveApplication()
      const name = app?.name ?? ''
      const appId = getAppIdFromProcessName(name)
      if (appId !== this.lastActiveAppId) {
        this.lastActiveAppId = appId
      }
    } catch {
      // ignore
    }
  }

  private pollClipboard(): void {
    if (this.suspended) return
    if (!this.privacy.isGlobalMonitoringEnabled()) return

    try {
      const text = this.platform.getClipboardText()
      const html = this.platform.getClipboardHtml()

      if (text === this.lastClipboardText && html === this.lastClipboardHtml) return
      this.lastClipboardText = text
      this.lastClipboardHtml = html

      if (text.length < MIN_CLIPBOARD_LENGTH_FOR_ANALYSIS) return

      const content = this.extractor.extractFromText(text, 'clipboard', this.lastActiveAppId ?? 'generic')
      if (content.urls.length === 0 && content.snippet && content.snippet.length < 30) return

      const appId = this.lastActiveAppId ?? 'generic'
      if (!this.privacy.isMonitoringAllowed(appId)) return

      this.privacy.requireNoStorage(text)

      const sourceType = getContentSourceType(appId)
      const context: ContentContext =
        sourceType === 'email'
          ? { type: 'email', email: {} }
          : sourceType === 'messaging'
            ? { type: 'messaging', message: { isForward: this.detectForwardInText(text) } }
            : sourceType === 'browser'
              ? { type: 'browser', browser: {} }
              : { type: 'clipboard', clipboard: {} }

      this.integrator.analyzeContent(content, context).then((result) => {
        if (!result.threatDetected) {
          result.linkResults?.forEach((r) => this.onLinkScanned?.(r.riskScore))
          return
        }
        const settings = this.settingsManager.getSettings()
        const firstBadLink = result.linkResults?.find((r) => r.riskScore >= 50)
        const riskScore = firstBadLink?.riskScore ?? result.riskScore ?? 60
        this.onLinkScanned?.(riskScore)
        this.alertManager.addAlert(
          {
            type: 'suspicious_link',
            severity: result.riskScore >= 80 ? 'high' : result.riskScore >= 60 ? 'medium' : 'low',
            source: 'Clipboard',
            message: result.reasons[0] ?? 'Suspicious content detected',
            link: firstBadLink?.url,
            appId,
            riskScore,
          },
          settings.alertPreferences
        )
      }).catch((err) => {
        logger.error('AppMonitorManager: analyzeContent failed', err)
      })
    } catch (err) {
      logger.warn('AppMonitorManager: pollClipboard error', err)
    }
  }

  private detectForwardInText(text: string): boolean {
    const t = text.slice(0, 200).toLowerCase()
    return /^(forwarded|fwd|----------\s*forwarded)/im.test(t) || /^forwarded\s*:/im.test(t)
  }

  private async pollBrowserUrl(): Promise<void> {
    if (this.suspended) return
    if (!this.privacy.isGlobalMonitoringEnabled()) return
    const appId = this.lastActiveAppId
    if (appId !== 'chrome' && appId !== 'safari') return
    if (!this.privacy.isMonitoringAllowed(appId)) return

    try {
      const url = await this.platform.getCurrentBrowserUrl()
      if (!url || url === this.lastBrowserUrl) return
      this.lastBrowserUrl = url

      const result = await this.linkScanner.scan(url, {
        debugContext: { isEmail: false, source: 'browser' },
      })
      this.onLinkScanned?.(result.riskScore)

      if (result.riskScore >= 50) {
        const settings = this.settingsManager.getSettings()
        const severity = result.riskScore >= 80 ? 'high' : result.riskScore >= 60 ? 'medium' : 'low'
        this.alertManager.addAlert(
          {
            type: 'phishing',
            severity,
            source: 'Browser',
            message: result.explanation,
            link: result.resolvedUrl ?? result.url,
            appId,
            riskScore: result.riskScore,
          },
          settings.alertPreferences
        )
      }
    } catch (err) {
      logger.debug('AppMonitorManager: pollBrowserUrl failed', err)
    }
  }
}
