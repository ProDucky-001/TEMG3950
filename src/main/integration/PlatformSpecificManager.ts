import { clipboard, powerMonitor } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { PlatformName } from '../../shared/integration-types'
import { logger } from '../services/logger'
import { normalizeAppName } from '../utils/appNameNormalizer'

const execAsync = promisify(exec)

export interface ActiveAppInfo {
  name: string
  bundleId?: string
  path?: string
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
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

  /**
   * Get frontmost app on macOS: prefer NSWorkspace.localizedName for proper display name,
   * then System Events process name. Always return normalized name (Title Case / bundle map).
   */
  private async getActiveAppDarwin(): Promise<ActiveAppInfo | null> {
    let processName = ''
    let bundleId: string | undefined
    let source: 'NSWorkspace' | 'System Events' = 'System Events'

    try {
      const { stdout } = await execAsync(
        `osascript -l JavaScript -e '
ObjC.import("Cocoa");
var out = "";
try {
  var ws = $.NSWorkspace.sharedWorkspace();
  var app = ws.frontmostApplication();
  if (app && !app.isEqual($.NSNull.null)) {
    var n = app.localizedName();
    var b = app.bundleIdentifier();
    out = (n ? n.toString() : "") + "|||" + (b ? b.toString() : "");
  }
} catch (e) {}
out;
' 2>/dev/null`,
        { timeout: 3000 }
      )
      const line = (stdout ?? '').trim()
      if (line && line.includes('|||')) {
        const [name, bid] = line.split('|||')
        processName = (name ?? '').trim()
        const b = (bid ?? '').trim()
        if (b) bundleId = b
        if (processName) source = 'NSWorkspace'
      }
    } catch {
      // fall through to System Events
    }

    if (!processName) {
      try {
        const { stdout } = await execAsync(
          "osascript -e 'tell application \"System Events\" to get name of first process whose frontmost is true' 2>/dev/null",
          { timeout: 3000 }
        )
        processName = (stdout ?? '').trim()
      } catch {
        try {
          const { stdout } = await execAsync(
            "osascript -e 'tell application \"System Events\" to return name of first application process whose frontmost is true' 2>/dev/null",
            { timeout: 3000 }
          )
          processName = (stdout ?? '').trim()
        } catch {
          // ignore
        }
      }
    }

    if (!processName) return null

    const name = normalizeAppName(processName, bundleId)
    return { name, bundleId }
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

  /**
   * Get the bounds of the frontmost window (for overlays). Returns null if unavailable.
   * On macOS: uses AppleScript (System Events → AXFrame, or position/size fallback). Converts Cocoa bottom-left to top-left using primaryDisplayHeight.
   * Used by OverlayManager for overlay positioning and by ActiveWindowMonitor to supply real bounds for DetectionManager / ScreenCaptureManager.
   */
  async getFrontmostWindowBounds(primaryDisplayHeight?: number): Promise<WindowBounds | null> {
    try {
      if (this.platform === 'darwin') {
        return await this.getFrontmostWindowBoundsDarwin(primaryDisplayHeight)
      }
      if (this.platform === 'win32') {
        return await this.getFrontmostWindowBoundsWindows()
      }
    } catch (err) {
      logger.debug('PlatformSpecificManager: getFrontmostWindowBounds failed', err)
    }
    return null
  }

  private async getFrontmostWindowBoundsDarwin(primaryDisplayHeight?: number): Promise<WindowBounds | null> {
    // All AppleScript sources return logical (DIP) coordinates. AXFrame is (x, yCocoa, width, height); position+size and bounds are (left, top) + size or (left, top, right, bottom).
    // We always return { x, y, width, height } with width = right - left, height = bottom - top when we have a rect.
    try {
      const { stdout: axOut } = await execAsync(
        `osascript -e 'tell application "System Events"
          set p to first process whose frontmost is true
          try
            set w to window 1 of p
            set f to value of attribute "AXFrame" of w
            return (item 1 of f) & "," & (item 2 of f) & "," & (item 3 of f) & "," & (item 4 of f)
          end try
        end tell' 2>/dev/null`,
        { timeout: 2000 }
      )
      const axRaw = (axOut ?? '').trim()
      const axParts = axRaw.split(',').map((n) => parseInt(n, 10))
      if (axParts.length === 4 && !axParts.some((n) => isNaN(n) || n < 0) && axParts[2] >= 50 && axParts[3] >= 50) {
        const [left, yCocoa, width, height] = axParts
        const y = typeof primaryDisplayHeight === 'number' && primaryDisplayHeight > 0
          ? primaryDisplayHeight - yCocoa - height
          : yCocoa
        return { x: left, y, width, height }
      }
    } catch {
      // AXFrame not available
    }
    try {
      const { stdout } = await execAsync(
        `osascript -e 'tell application "System Events"
          set p to first process whose frontmost is true
          try
            set w to window 1 of p
            set pos to position of w
            set sz to size of w
            return (item 1 of pos) & "," & (item 2 of pos) & "," & (item 1 of sz) & "," & (item 2 of sz)
          end try
        end tell' 2>/dev/null`,
        { timeout: 2000 }
      )
      const s = (stdout ?? '').trim()
      if (!s) return null
      const parts = s.split(',').map((n) => parseInt(n, 10))
      if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0)) return null
      let [x, y, width, height] = parts
      if (width < 50 || height < 50) return null
      if (typeof primaryDisplayHeight === 'number' && primaryDisplayHeight > 0) {
        y = primaryDisplayHeight - y - height
      }
      return { x, y, width, height }
    } catch {
      // fall through to bounds rect
    }
    try {
      const { stdout } = await execAsync(
        `osascript -e 'tell application "System Events"
          set p to first process whose frontmost is true
          try
            set w to window 1 of p
            set b to bounds of w
            return (item 1 of b) & "," & (item 2 of b) & "," & (item 3 of b) & "," & (item 4 of b)
          end try
        end tell' 2>/dev/null`,
        { timeout: 2000 }
      )
      const s = (stdout ?? '').trim()
      if (!s) return null
      const parts = s.split(',').map((n) => parseInt(n, 10))
      if (parts.length !== 4 || parts.some((n) => isNaN(n))) return null
      const [left, top, right, bottom] = parts
      const width = right - left
      const height = bottom - top
      if (width < 50 || height < 50) return null
      let y = top
      if (typeof primaryDisplayHeight === 'number' && primaryDisplayHeight > 0) {
        y = primaryDisplayHeight - top - height
      }
      return { x: left, y, width, height }
    } catch {
      return null
    }
  }

  private async getFrontmostWindowBoundsWindows(): Promise<WindowBounds | null> {
    return null
  }

  /**
   * Restore focus to the given application (e.g. after showing our overlay so we don't steal focus).
   * Only implemented on macOS; no-op on other platforms.
   */
  restoreFrontmost(appName: string): void {
    if (!appName || typeof appName !== 'string') return
    if (this.platform !== 'darwin') return
    const escaped = appName.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    if (!escaped) return
    exec(
      `osascript -e "tell application \\"System Events\\" to set frontmost of first process whose name is \\"${escaped}\\" to true" 2>/dev/null`,
      () => {}
    )
  }

  /**
   * Get the current tab URL when the frontmost app is Safari or Chrome (macOS).
   * Returns null if not a supported browser or unsupported platform.
   */
  async getCurrentBrowserUrl(): Promise<string | null> {
    try {
      if (this.platform === 'darwin') {
        return await this.getBrowserURL()
      }
      if (this.platform === 'win32') {
        return await this.getCurrentBrowserUrlWindows()
      }
    } catch (err) {
      logger.debug('PlatformSpecificManager: getCurrentBrowserUrl failed', err)
    }
    return null
  }

  /**
   * Get frontmost process name via System Events (macOS).
   */
  private async getActiveBrowser(): Promise<string | null> {
    try {
      const { stdout } = await execAsync(
        "osascript -e 'tell application \"System Events\" to get name of first process whose frontmost is true'",
        { encoding: 'utf8', timeout: 3000 }
      )
      return (stdout ?? '').trim() || null
    } catch {
      return null
    }
  }

  /**
   * Get URL of front document from Safari (macOS).
   */
  private async getSafariURL(): Promise<string | null> {
    try {
      const { stdout } = await execAsync(
        "osascript -e 'tell application \"Safari\" to return URL of front document'",
        { encoding: 'utf8', timeout: 500 }
      )
      const u = (stdout ?? '').trim()
      return u && u.startsWith('http') ? u : null
    } catch {
      return null
    }
  }

  /**
   * Get URL of active tab of front window from Google Chrome (macOS).
   */
  private async getChromeURL(): Promise<string | null> {
    try {
      const { stdout } = await execAsync(
        "osascript -e 'tell application \"Google Chrome\" to return URL of active tab of front window'",
        { encoding: 'utf8', timeout: 500 }
      )
      const u = (stdout ?? '').trim()
      return u && u.startsWith('http') ? u : null
    } catch {
      return null
    }
  }

  /**
   * Get browser URL for Safari or Chrome only (macOS). Checks active app and calls the appropriate extractor.
   */
  async getBrowserURL(): Promise<string | null> {
    if (this.platform !== 'darwin') return null
    const activeApp = await this.getActiveBrowser()
    if (!activeApp) return null
    const name = normalizeAppName(activeApp, undefined)
    const nameLower = name.toLowerCase()
    if (nameLower.includes('safari')) {
      return await this.getSafariURL()
    }
    if (nameLower.includes('chrome') || nameLower.includes('google')) {
      return await this.getChromeURL()
    }
    return null
  }

  private async getCurrentBrowserUrlWindows(): Promise<string | null> {
    return null
  }
}
