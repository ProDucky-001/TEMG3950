import { systemPreferences, desktopCapturer, shell, dialog } from 'electron'

export type PermissionType = 'screen' | 'accessibility'

export interface PermissionStatus {
  screen: { granted: boolean; canRequest: boolean; message?: string }
  accessibility: { granted: boolean; canRequest: boolean; message?: string }
}

export interface PermissionManagerOptions {
  /** App name shown in dialogs */
  appName?: string
}

/**
 * Cross-platform permission manager for Screen Recording and Accessibility.
 * macOS: uses getMediaAccessStatus + isTrustedAccessibilityClient.
 * Windows: screen recording typically works without a separate prompt; accessibility is not used the same way.
 */
export class PermissionManager {
  private appName: string

  constructor(options: PermissionManagerOptions = {}) {
    this.appName = options.appName ?? 'ScamShield'
  }

  /**
   * Check if screen recording permission is granted.
   * macOS: Screen Recording in Privacy & Security.
   * Windows: usually granted; we still try to verify with desktopCapturer when needed.
   */
  checkScreenRecording(): boolean {
    if (process.platform !== 'darwin' && process.platform !== 'win32') return true
    try {
      if (process.platform === 'darwin') {
        return systemPreferences.getMediaAccessStatus('screen') === 'granted'
      }
      return true
    } catch {
      return false
    }
  }

  /**
   * Request screen recording permission (triggers system dialog on macOS).
   * Verifies by calling desktopCapturer.getSources.
   */
  async requestScreenRecording(): Promise<{ granted: boolean; message?: string }> {
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      return { granted: true }
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 },
      })
      const granted = sources.length > 0
      return {
        granted,
        message: granted ? undefined : 'No screen sources available. Enable Screen Recording in System Settings.',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { granted: false, message }
    }
  }

  /**
   * Check accessibility permission (macOS only; required for active window detection).
   */
  checkAccessibility(): boolean {
    if (process.platform !== 'darwin') return true
    try {
      return systemPreferences.isTrustedAccessibilityClient(false)
    } catch {
      return false
    }
  }

  /**
   * Request accessibility permission (macOS). Opens system prefs and optionally shows instructions.
   * Pass promptUser: true to trigger the system prompt and show an explanation dialog.
   */
  async requestAccessibility(promptUser: boolean = true): Promise<{ granted: boolean; opened: boolean; message: string }> {
    if (process.platform !== 'darwin') {
      return { granted: true, opened: false, message: 'Not required on this platform.' }
    }
    try {
      if (promptUser) {
        systemPreferences.isTrustedAccessibilityClient(true)
      }
      const granted = systemPreferences.isTrustedAccessibilityClient(false)
      return {
        granted,
        opened: false,
        message: granted
          ? 'Accessibility access is enabled.'
          : 'Enable this app in System Settings → Privacy & Security → Accessibility, then restart the app.',
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { granted: false, opened: false, message }
    }
  }

  /**
   * Get unified status for both permissions (for tray menu / UI).
   */
  getAllStatus(): PermissionStatus {
    const screenGranted = this.checkScreenRecording()
    const accessibilityGranted = this.checkAccessibility()
    return {
      screen: {
        granted: screenGranted,
        canRequest: process.platform === 'darwin' || process.platform === 'win32',
        message: screenGranted ? undefined : 'Required for screen capture and email context detection.',
      },
      accessibility: {
        granted: accessibilityGranted,
        canRequest: process.platform === 'darwin',
        message: accessibilityGranted ? undefined : 'Required for active window detection and overlay.',
      },
    }
  }

  /**
   * Open system preferences to the given section (macOS).
   */
  openSystemPreferences(section: 'screen' | 'accessibility'): boolean {
    if (process.platform !== 'darwin') return false
    try {
      if (section === 'screen') {
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
      } else {
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
      }
      return true
    } catch {
      return false
    }
  }

  /**
   * Show an explanation dialog for screen recording and guide user to Settings.
   */
  async showScreenRecordingDialog(): Promise<void> {
    const hasPermission = this.checkScreenRecording()
    if (hasPermission) return
    const detail =
      process.platform === 'darwin'
        ? `1. Open System Settings → Privacy & Security → Screen Recording\n` +
          `2. Enable permission for this app (Electron when using npm run dev, or ${this.appName} when built).\n` +
          `3. Restart the application.`
        : `Enable screen capture in your system settings if the feature is not working.`
    await dialog.showMessageBox({
      type: 'info',
      title: `${this.appName} — Screen Recording`,
      message: 'Screen recording permission is needed for email context detection.',
      detail,
      buttons: ['Open System Settings', 'OK'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) this.openSystemPreferences('screen')
    })
  }

  /**
   * Show an explanation dialog for accessibility and guide user to Settings.
   */
  async showAccessibilityDialog(): Promise<void> {
    if (process.platform !== 'darwin') return
    const hasPermission = this.checkAccessibility()
    if (hasPermission) return
    systemPreferences.isTrustedAccessibilityClient(true)
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: `${this.appName} — Accessibility Permission Required`,
      message: 'Accessibility permission is needed to monitor the active window and protect you from scams.',
      detail:
        'If you didn\'t see a system prompt:\n\n' +
        '• Open System Settings → Privacy & Security → Accessibility\n' +
        `• Add ${this.appName} (or Electron when developing) and turn the toggle ON.\n` +
        '• Fully quit the app from the tray, then start it again.\n\n' +
        'Then click "I\'ve Enabled It" to continue.',
      buttons: ["I've Enabled It", 'Open System Settings', 'Continue Without'],
      defaultId: 0,
      cancelId: 2,
    })
    if (response === 1) {
      this.openSystemPreferences('accessibility')
    }
  }
}
