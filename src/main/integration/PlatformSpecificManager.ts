import { clipboard, powerMonitor } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { PlatformName } from '../../shared/integration-types'
import { logger } from '../services/logger'

const execAsync = promisify(exec)

export interface ActiveAppInfo {
  name: string
  bundleId?: string
  path?: string
}

export interface PlatformCapabilities {
  clipboard: boolean
  activeApp: boolean
  accessibility: boolean
}

/**
 * Handles platform-specific APIs (macOS, Windows, Linux) with graceful fallbacks.
 */
export class PlatformSpecificManager {
  private readonly platform: PlatformName
  private accessibilityChecked = false
  private accessibilityGranted: boolean | null = null

  constructor() {
    this.platform = process.platform as PlatformName
  }

  getPlatform(): PlatformName {
    return this.platform
  }

  getCapabilities(): PlatformCapabilities {
    return {
      clipboard: true,
      activeApp: this.platform === 'darwin' || this.platform === 'win32' || this.platform === 'linux',
      accessibility: this.platform === 'darwin' || this.platform === 'win32',
    }
  }

  /**
   * Get current clipboard text. Safe on all platforms.
   */
  getClipboardText(): string {
    try {
      return clipboard.readText() ?? ''
    } catch (err) {
      logger.warn('PlatformSpecificManager: getClipboardText failed', err)
      return ''
    }
  }

  /**
   * Get current clipboard HTML if available (for rich content).
   */
  getClipboardHtml(): string {
    try {
      return clipboard.readHTML() ?? ''
    } catch {
      return ''
    }
  }

  /**
   * Get the frontmost / active application name. Platform-specific with fallbacks.
   */
  async getActiveApplication(): Promise<ActiveAppInfo | null> {
    try {
      if (this.platform === 'darwin') {
        return await this.getActiveAppDarwin()
      }
      if (this.platform === 'win32') {
        return await this.getActiveAppWindows()
      }
      if (this.platform === 'linux') {
        return await this.getActiveAppLinux()
      }
    } catch (err) {
      logger.debug('PlatformSpecificManager: getActiveApplication failed', err)
    }
    return null
  }

  private async getActiveAppDarwin(): Promise<ActiveAppInfo | null> {
    try {
      const { stdout } = await execAsync(
        "osascript -e 'tell application \"System Events\" to get name of first process whose frontmost is true' 2>/dev/null"
      )
      const name = (stdout ?? '').trim()
      if (name) return { name }
    } catch {
      // Fallback: try using AppleScript alternate
      try {
        const { stdout } = await execAsync(
          "osascript -e 'tell application \"System Events\" to return name of first application process whose frontmost is true' 2>/dev/null"
        )
        const name = (stdout ?? '').trim()
        if (name) return { name }
      } catch {
        // ignore
      }
    }
    return null
  }

  private async getActiveAppWindows(): Promise<ActiveAppInfo | null> {
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Add-Type @\'\\nusing System; using System.Runtime.InteropServices; public class Win { [DllImport(\\\"user32.dll\\\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\\\"user32.dll\\\")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder t, int c); }\\n\'@; $h = [Win]::GetForegroundWindow(); $t = New-Object System.Text.StringBuilder 256; [Win]::GetWindowText($h, $t, 256) | Out-Null; $t.ToString()"',
        { timeout: 3000 }
      )
      const title = (stdout ?? '').trim()
      if (title) return { name: title }
    } catch {
      try {
        const { stdout } = await execAsync(
          'wmic process where ProcessId=(select ProcessId from Win32_Process where ProcessId=(select ParentProcessId from Win32_Process where ProcessId=pid())) get Name 2>nul',
          { timeout: 2000 }
        )
        const name = (stdout ?? '').split('\n').map((s) => s.trim()).filter(Boolean)[1]
        if (name) return { name }
      } catch {
        // ignore
      }
    }
    return null
  }

  private async getActiveAppLinux(): Promise<ActiveAppInfo | null> {
    try {
      const { stdout } = await execAsync('xdotool getwindowname $(xdotool getactivewindow) 2>/dev/null', {
        timeout: 2000,
      })
      const name = (stdout ?? '').trim()
      if (name) return { name }
    } catch {
      try {
        const { stdout } = await execAsync('wmctrl -a :ACTIVE: 2>/dev/null; echo $?', { timeout: 2000 })
        if (stdout) return { name: 'Unknown' }
      } catch {
        // ignore
      }
    }
    return null
  }

  /**
   * Subscribe to power state changes (suspend/resume). Use for pausing/resuming monitoring.
   */
  onPowerStateChange(callback: (state: 'suspend' | 'resume') => void): () => void {
    const onSuspend = () => callback('suspend')
    const onResume = () => callback('resume')
    powerMonitor.on('suspend', onSuspend)
    powerMonitor.on('resume', onResume)
    return () => {
      powerMonitor.off('suspend', onSuspend)
      powerMonitor.off('resume', onResume)
    }
  }

  /**
   * Check whether accessibility permission is granted (macOS: Screen Recording / Accessibility).
   * Best-effort; may return false if we cannot verify.
   */
  async checkAccessibilityPermission(): Promise<{ granted: boolean; message?: string }> {
    if (this.accessibilityChecked && this.accessibilityGranted !== null) {
      return {
        granted: this.accessibilityGranted,
        message: this.accessibilityGranted ? undefined : 'Accessibility access was not detected.',
      }
    }
    this.accessibilityChecked = true
    if (this.platform === 'darwin') {
      try {
        const { stdout } = await execAsync(
          'osascript -e "tell application \\"System Events\\" to get name of first process whose frontmost is true" 2>&1'
        )
        const hasOutput = (stdout ?? '').trim().length > 0
        const granted = !stdout.includes('Not authorized') && !stdout.includes('assistive')
        this.accessibilityGranted = granted && hasOutput
        return {
          granted: this.accessibilityGranted,
          message: this.accessibilityGranted
            ? undefined
            : 'Enable ScamShield in System Settings > Privacy & Security > Accessibility to monitor active app.',
        }
      } catch {
        this.accessibilityGranted = false
        return {
          granted: false,
          message: 'Could not verify accessibility. Enable ScamShield in System Settings > Privacy & Security > Accessibility.',
        }
      }
    }
    if (this.platform === 'win32') {
      this.accessibilityGranted = true
      return { granted: true }
    }
    this.accessibilityGranted = true
    return { granted: true }
  }

  /**
   * Request accessibility permission (opens system preferences on macOS).
   */
  async requestAccessibilityPermission(): Promise<{ opened: boolean; message: string }> {
    if (this.platform === 'darwin') {
      try {
        await execAsync('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"')
        return { opened: true, message: 'Open System Settings and add ScamShield to Accessibility.' }
      } catch (err) {
        logger.warn('PlatformSpecificManager: requestAccessibilityPermission failed', err)
        return { opened: false, message: 'Could not open System Settings.' }
      }
    }
    if (this.platform === 'win32') {
      return { opened: false, message: 'On Windows, ensure ScamShield is allowed in Settings > Privacy > Other devices.' }
    }
    return { opened: false, message: 'Accessibility is not required on this platform for basic monitoring.' }
  }

  resetAccessibilityCache(): void {
    this.accessibilityChecked = false
    this.accessibilityGranted = null
  }
}
