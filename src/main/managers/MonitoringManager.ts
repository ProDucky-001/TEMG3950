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
    const settings = this.settingsManager.getSettings()
    this.enabled = settings.monitoringEnabled

    // Simulate background scanning - in production this would integrate with
    // clipboard monitoring, URL detection, etc.
    this.scanInterval = setInterval(() => {
      this.performScan()
    }, 30000) // Scan every 30 seconds
  }

  stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval)
      this.scanInterval = null
    }
  }

  private performScan(): void {
    if (!this.enabled) return

    const settings = this.settingsManager.getSettings()
    if (!settings.monitoringEnabled) return

    const demoUrls = [
      'https://amaz0n-account-verify.tk/login?redirect=paypal',
      'https://secure-google-signin.xyz/update',
      'https://bit.ly/3xYz123',
      'https://192.168.1.1/login',
      'https://legitimate-site.com/page',
    ]
    const urlToScan = demoUrls[Math.floor(Math.random() * demoUrls.length)]

    this.linkScanner.scan(urlToScan).then((result) => {
      this.linksScanned++
      this.lastScanTime = Date.now()

      if (result.riskScore >= 50) {
        this.threatsDetected++
        const severity =
          result.riskScore >= 80 ? 'critical' : result.riskScore >= 60 ? 'high' : 'medium'
        this.alertManager.addAlert(
          {
            type: 'phishing',
            severity,
            source: 'Link scanner',
            message: result.explanation,
            link: result.resolvedUrl ?? result.url,
          },
          settings.alertPreferences
        )
      }
    }).catch((err) => {
      console.error('[ScamShield] Link scan error:', err)
    })
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
