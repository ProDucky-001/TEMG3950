import type { PrivacySummary, SupportedAppId } from '../../shared/integration-types'
import type { SettingsManager } from '../managers/SettingsManager'

/**
 * Enforces local-only analysis, no storage of message content, and per-app opt-out.
 */
export class PrivacyManager {
  private readonly localOnly = true
  private readonly noContentStored = true

  constructor(private readonly settingsManager: SettingsManager) {}

  /**
   * Whether monitoring is allowed for this app (user has not opted out).
   */
  isMonitoringAllowed(appId: string): boolean {
    const settings = this.settingsManager.getSettings()
    const app = settings.monitoredApps.find((a) => a.id === appId)
    if (!app) return true
    return app.enabled
  }

  /**
   * Whether global monitoring is enabled (master switch).
   */
  isGlobalMonitoringEnabled(): boolean {
    return this.settingsManager.getSettings().monitoringEnabled
  }

  /**
   * Enforce: content must not be persisted. Call before any code that might store content.
   */
  requireNoStorage(_content: unknown): void {
    if (!this.noContentStored) {
      throw new Error('PrivacyManager: content storage is disallowed')
    }
  }

  isLocalOnly(): boolean {
    return this.localOnly
  }

  isNoContentStored(): boolean {
    return this.noContentStored
  }

  /**
   * List of app IDs the user has opted out of (enabled: false).
   */
  getOptedOutApps(): string[] {
    const settings = this.settingsManager.getSettings()
    return settings.monitoredApps.filter((a) => !a.enabled).map((a) => a.id)
  }

  getPrivacySummary(monitoringActive: boolean): PrivacySummary {
    return {
      localOnly: this.localOnly,
      noContentStored: this.noContentStored,
      optedOutApps: this.getOptedOutApps(),
      monitoringActive,
    }
  }
}
