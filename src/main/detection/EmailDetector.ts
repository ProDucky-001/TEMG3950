import type { ActiveWindowInfo } from './ActiveWindowInfo'
import type { ActiveWindowMonitor } from './ActiveWindowMonitor'
import { isEmailApplication } from './EmailPatterns'

export interface EmailDetectorResult {
  isEmailApp: boolean
  appType: 'webmail' | 'desktop' | null
  appName: string | null
  url: string | null | undefined
  windowInfo: ActiveWindowInfo | null
}

/**
 * Detects whether the current active window is an email application (webmail or desktop).
 * Delegates to ActiveWindowMonitor and EmailPatterns.isEmailApplication.
 */
export class EmailDetector {
  constructor(private readonly activeWindowMonitor: ActiveWindowMonitor) {}

  /**
   * Get current email app state from the active window.
   */
  getCurrentState(): EmailDetectorResult {
    const windowInfo = this.activeWindowMonitor.getCurrentWindow()
    if (!windowInfo) {
      return {
        isEmailApp: false,
        appType: null,
        appName: null,
        url: undefined,
        windowInfo: null,
      }
    }
    const check = isEmailApplication(windowInfo)
    return {
      isEmailApp: check.isEmail,
      appType: check.appType,
      appName: check.appName,
      url: check.url ?? windowInfo.url,
      windowInfo,
    }
  }

  /**
   * Check if an email app is currently active (convenience wrapper).
   */
  isEmailAppActive(): boolean {
    return this.activeWindowMonitor.isEmailAppActive().isEmail
  }

  /**
   * Subscribe to active window changes and get email state on each change.
   */
  onStateChange(callback: (result: EmailDetectorResult) => void): () => void {
    return this.activeWindowMonitor.onWindowChange((info) => {
      callback(this.getStateFromWindow(info))
    })
  }

  private getStateFromWindow(windowInfo: ActiveWindowInfo | null): EmailDetectorResult {
    if (!windowInfo) {
      return {
        isEmailApp: false,
        appType: null,
        appName: null,
        url: undefined,
        windowInfo: null,
      }
    }
    const check = isEmailApplication(windowInfo)
    return {
      isEmailApp: check.isEmail,
      appType: check.appType,
      appName: check.appName,
      url: check.url ?? windowInfo.url,
      windowInfo,
    }
  }
}
