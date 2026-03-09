import type { SettingsManager } from './SettingsManager'
import type { AlertManager } from './AlertManager'
import type { LinkScanner } from '../services/LinkScanner'
import type { ThreatStatus } from '../../shared/types'

export class MonitoringManager {
  private enabled = true
  private settingsManager: SettingsManager
  private alertManager: AlertManager
  private linkScanner: LinkScanner
  private linksScanned = 0
  private threatsDetected = 0
  private lastScanTime = 0
  private scanInterval: ReturnType<typeof setInterval> | null = null

  constructor(
    settingsManager: SettingsManager,
    alertManager: AlertManager,
    linkScanner: LinkScanner
  ) {
    this.settingsManager = settingsManager
    this.alertManager = alertManager
    this.linkScanner = linkScanner
  }

  async start(): Promise<void> {
    this.stop()
    const settings = this.settingsManager.getSettings()
    this.enabled = settings.monitoringEnabled
    // No periodic random URL scanning. URLs are analyzed when:
    // - User pastes a URL and it appears in the clipboard (clipboard monitoring),
    // - User manually scans a link from the dashboard (Check URL).
    // Stats are updated via recordScan() when any scan completes.
  }

  stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval)
      this.scanInterval = null
    }
  }

  /** Call when a link scan completes (manual or clipboard) to update stats */
  recordScan(riskScore: number): void {
    this.linksScanned++
    this.lastScanTime = Date.now()
    if (riskScore >= 50) this.threatsDetected++
  }

  toggle(): boolean {
    this.enabled = !this.enabled
    this.settingsManager.updateSettings({ monitoringEnabled: this.enabled })
    return this.enabled
  }

  getStatus(): { enabled: boolean } {
    return { enabled: this.enabled }
  }

  getThreatStatus(): ThreatStatus {
    if (this.threatsDetected > 5) return 'threat'
    if (this.threatsDetected > 0 || !this.enabled) return 'warning'
    return 'safe'
  }

  getStatistics() {
    return {
      linksScanned: this.linksScanned,
      threatsDetected: this.threatsDetected,
      lastScanTime: this.lastScanTime,
    }
  }
}
