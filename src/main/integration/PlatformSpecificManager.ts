import { clipboard, powerMonitor } from 'electron'
import * as fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { PlatformName } from '../../shared/integration-types'
import { logger } from '../services/logger'

const execAsync = promisify(exec)
const DEBUG_LOG_PATH = '/Users/symok/Desktop/UST1-2/Anti Scam/.cursor/debug-2b6709.log'
function debugLog(payload: Record<string, unknown>): void {
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify({ sessionId: '2b6709', ...payload, timestamp: Date.now() }) + '\n')
  } catch (_) {}
}

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
  private _loggedFirefoxUrlOnce = false
  private _loggedFirefoxF1 = false

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

  /**
   * Get the bounds of the frontmost window (for overlays). Returns null if unavailable.
   * On macOS, pass primaryDisplayHeight to convert AXFrame from Cocoa (bottom-left origin) to top-left.
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
        const [x, yCocoa, width, height] = axParts
        const y = typeof primaryDisplayHeight === 'number' && primaryDisplayHeight > 0
          ? primaryDisplayHeight - yCocoa - height
          : yCocoa
        return { x, y, width, height }
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
   * Get the current tab URL when the frontmost app is a supported browser (macOS).
   * Returns null if not a browser, permission denied, or unsupported platform.
   */
  async getCurrentBrowserUrl(): Promise<string | null> {
    try {
      if (this.platform === 'darwin') {
        return await this.getCurrentBrowserUrlDarwin()
      }
      if (this.platform === 'win32') {
        return await this.getCurrentBrowserUrlWindows()
      }
    } catch (err) {
      logger.debug('PlatformSpecificManager: getCurrentBrowserUrl failed', err)
    }
    return null
  }

  private async getCurrentBrowserUrlDarwin(): Promise<string | null> {
    let appName = ''
    let url = ''
    try {
      // Single script: get frontmost app and its URL atomically
      const { stdout } = await execAsync(
        "osascript -e 'set frontApp to \"\"' -e 'set frontUrl to \"\"' -e 'try' -e 'tell application \"System Events\" to set frontApp to name of first process whose frontmost is true' -e 'end try' -e 'if frontApp is not \"\" then' -e 'try' -e 'if (frontApp contains \"Chrome\") or (frontApp contains \"Google\") then' -e 'tell application \"Google Chrome\" to set frontUrl to URL of active tab of front window' -e 'else if (frontApp contains \"Safari\") then' -e 'tell application \"Safari\" to set frontUrl to URL of current tab of front window' -e 'else if (frontApp contains \"Firefox\") then' -e 'tell application \"Firefox\" to set frontUrl to URL of current tab of front window' -e 'else if (frontApp contains \"Edge\") then' -e 'tell application \"Microsoft Edge\" to set frontUrl to URL of active tab of front window' -e 'end if' -e 'end try' -e 'end if' -e 'return frontApp & \"|||\" & frontUrl'",
        { timeout: 5000 }
      )
      const combined = (stdout ?? '').trim()
      const sep = '|||'
      const idx = combined.indexOf(sep)
      appName = idx >= 0 ? combined.slice(0, idx).trim() : ''
      url = idx >= 0 ? combined.slice(idx + sep.length).trim() : ''
    } catch (_) {
      // Combined script can throw when Firefox is front; get app name only then try per-browser fallback
      try {
        const { stdout: nameOut } = await execAsync(
          "osascript -e 'tell application \"System Events\" to get name of first process whose frontmost is true' 2>/dev/null",
          { timeout: 3000 }
        )
        appName = (nameOut ?? '').trim()
      } catch {
        return null
      }
    }
    if (url && url.startsWith('http')) return url
    const nameLower = appName.toLowerCase()
    if (nameLower.includes('firefox')) {
        // #region agent log
        if (!this._loggedFirefoxF1) { this._loggedFirefoxF1 = true; fetch('http://127.0.0.1:7799/ingest/2f9d4b64-93fa-4b9d-8d61-3e63f5789b0d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b6709'},body:JSON.stringify({sessionId:'2b6709',location:'PlatformSpecificManager:getCurrentBrowserUrlDarwin',message:'Firefox branch',data:{appName,combinedHasUrl:!!(url&&url.startsWith('http'))},timestamp:Date.now(),hypothesisId:'F1'})}).catch(()=>{}); }
        // #endregion
        debugLog({ location: 'PlatformSpecificManager:getCurrentBrowserUrlDarwin', message: 'Firefox branch', data: { appName, combinedHasUrl: !!(url && url.startsWith('http')) }, hypothesisId: 'F1' })
        const firefoxUrl = await this.getFirefoxUrl()
        if (firefoxUrl) return firefoxUrl
        try {
          const { stdout: out } = await execAsync(
            'osascript -e \'tell application "Firefox" to get URL of current tab of front window\' 2>/dev/null',
            { timeout: 3000 }
          )
          const u = (out ?? '').trim()
          if (u && u.startsWith('http')) return u
          // #region agent log
          if (!this._loggedFirefoxUrlOnce) { this._loggedFirefoxUrlOnce = true; fetch('http://127.0.0.1:7799/ingest/2f9d4b64-93fa-4b9d-8d61-3e63f5789b0d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b6709'},body:JSON.stringify({sessionId:'2b6709',location:'PlatformSpecificManager:Firefox fallback 1',message:'no URL',data:{preview:u.slice(0,80)},timestamp:Date.now(),hypothesisId:'F2'})}).catch(()=>{}); }
          // #endregion
        } catch (e) {
          // #region agent log
          if (!this._loggedFirefoxUrlOnce) { this._loggedFirefoxUrlOnce = true; fetch('http://127.0.0.1:7799/ingest/2f9d4b64-93fa-4b9d-8d61-3e63f5789b0d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b6709'},body:JSON.stringify({sessionId:'2b6709',location:'PlatformSpecificManager:Firefox fallback 1',message:'throw',data:{err:String(e)},timestamp:Date.now(),hypothesisId:'F2'})}).catch(()=>{}); }
          // #endregion
        }
        try {
          const { stdout: out } = await execAsync(
            'osascript -e \'tell application "Firefox" to get URL of current tab of window 1\' 2>/dev/null',
            { timeout: 3000 }
          )
          const u = (out ?? '').trim()
          if (u && u.startsWith('http')) return u
        } catch {
          // ignore
        }
          try {
            const { stdout: out } = await execAsync(
              'osascript -e \'tell application "System Events" to get value of combo box 1 of group 1 of toolbar "Navigation" of group 1 of front window of application process "Firefox"\' 2>/dev/null',
              { timeout: 3000 }
            )
          const u = (out ?? '').trim()
          if (u && u.length > 4) {
            const url = /^https?:\/\//i.test(u) ? u : 'https://' + u
            if (url.startsWith('http')) return url
          }
        } catch {
          // System Events URL bar fallback failed (needs Accessibility; Firefox may need accessibility.force_disabled = -1 in about:config)
        }
        try {
          const { stdout: out } = await execAsync(
            `osascript -l JavaScript -e 'var se = Application("System Events"); var fx = se.processes.whose({name: "Firefox"})[0]; var win = fx.windows[0]; var tb = win.toolbars[0]; var grps = tb.groups(); for (var i = 0; i < grps.length; i++) { try { var tfs = grps[i].textFields(); for (var j = 0; j < tfs.length; j++) { var v = tfs[j].value(); if (v && v.length > 4) { if (/^https?:\\/\\//.test(v)) return v; return "https://" + v; } } } catch(e) {} } ""' 2>/dev/null`,
            { timeout: 2000 }
          )
          const u = (out ?? '').trim()
          if (u && u.startsWith('http') && u.length > 10) return u
          // #region agent log
          if (!this._loggedFirefoxUrlOnce) { this._loggedFirefoxUrlOnce = true; fetch('http://127.0.0.1:7799/ingest/2f9d4b64-93fa-4b9d-8d61-3e63f5789b0d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b6709'},body:JSON.stringify({sessionId:'2b6709',location:'PlatformSpecificManager:Firefox JXA fallback',message:'no URL or short',data:{len:u.length},timestamp:Date.now(),hypothesisId:'F4'})}).catch(()=>{}); }
          // #endregion
        } catch (e) {
          // #region agent log
          if (!this._loggedFirefoxUrlOnce) { this._loggedFirefoxUrlOnce = true; fetch('http://127.0.0.1:7799/ingest/2f9d4b64-93fa-4b9d-8d61-3e63f5789b0d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b6709'},body:JSON.stringify({sessionId:'2b6709',location:'PlatformSpecificManager:Firefox JXA fallback',message:'throw',data:{err:String(e)},timestamp:Date.now(),hypothesisId:'F4'})}).catch(()=>{}); }
          // #endregion
        }
      }
      if (nameLower.includes('chrome') || nameLower.includes('google')) {
        try {
          const { stdout: out } = await execAsync(
            'osascript -e \'tell application "Google Chrome" to get URL of active tab of front window\' 2>/dev/null',
            { timeout: 3000 }
          )
          const u = (out ?? '').trim()
          if (u && u.startsWith('http')) return u
        } catch {
          // ignore
        }
      }
      if (nameLower.includes('safari')) {
        try {
          const { stdout: out } = await execAsync(
            'osascript -e \'tell application "Safari" to get URL of current tab of front window\' 2>/dev/null',
            { timeout: 3000 }
          )
          const u = (out ?? '').trim()
          if (u && u.startsWith('http')) return u
        } catch {
          // ignore
        }
      }
      if (nameLower.includes('edge')) {
        try {
          const { stdout: out } = await execAsync(
            'osascript -e \'tell application "Microsoft Edge" to get URL of active tab of front window\' 2>/dev/null',
            { timeout: 3000 }
          )
          const u = (out ?? '').trim()
          if (u && u.startsWith('http')) return u
        } catch {
          // ignore
        }
      }
      return null
  }

  private async getCurrentBrowserUrlWindows(): Promise<string | null> {
    return null
  }

  /**
   * Firefox-specific URL extraction via System Events (address bar).
   * Tries multiple AppleScript variants because Firefox's accessibility hierarchy varies by version/OS.
   * Runtime evidence: "toolbar 1" and "group 1 of window 1" can be Invalid index (-1719); use alternatives.
   */
  private async getFirefoxUrl(): Promise<string | null> {
    const scripts: Array<{ script: string; timeout?: number }> = [
      {
        script:
          'osascript -e \'tell application "System Events" to tell process "Firefox" to get value of combo box 1 of toolbar "Navigation" of front window\' 2>/dev/null',
        timeout: 3000,
      },
      {
        script:
          'osascript -e \'tell application "System Events" to tell process "Firefox" to get value of UI element 1 of combo box 1 of toolbar "Navigation" of first group of front window\' 2>/dev/null',
        timeout: 3000,
      },
      {
        script:
          'osascript -e \'tell application "System Events" to tell process "Firefox" to get value of first text field of toolbar 1 whose description is "Address and Search Bar"\' 2>/dev/null',
        timeout: 3000,
      },
      {
        script:
          'osascript -e \'tell application "System Events" to tell process "Firefox" to get value of combo box 1 of group 1 of toolbar "Navigation" of group 1 of front window\' 2>/dev/null',
        timeout: 3000,
      },
      {
        script:
          'osascript -e \'tell application "System Events" to get value of combo box 1 of group 1 of toolbar "Navigation" of group 1 of front window of application process "Firefox"\' 2>/dev/null',
        timeout: 3000,
      },
    ]
    for (let i = 0; i < scripts.length; i++) {
      const { script, timeout = 3000 } = scripts[i]
      try {
        const { stdout } = await execAsync(script, { timeout })
        const u = (stdout ?? '').trim()
        if (u && u.length > 4) {
          const url = /^https?:\/\//i.test(u) ? u : 'https://' + u
          if (url.startsWith('http')) {
            logger.debug('PlatformSpecificManager: getFirefoxUrl succeeded')
            debugLog({ location: 'PlatformSpecificManager:getFirefoxUrl', message: 'succeeded', data: { index: i, valueLength: u.length }, hypothesisId: 'F7' })
            return url
          }
        }
        debugLog({ location: 'PlatformSpecificManager:getFirefoxUrl', message: 'no valid url', data: { index: i, valueLength: u.length, preview: u.slice(0, 60) }, hypothesisId: 'F7' })
      } catch (e) {
        debugLog({ location: 'PlatformSpecificManager:getFirefoxUrl', message: 'script threw', data: { index: i, error: String(e) }, hypothesisId: 'F7' })
        // try next variant
      }
    }
    debugLog({ location: 'PlatformSpecificManager:getFirefoxUrl', message: 'all failed', data: { tried: scripts.length }, hypothesisId: 'F7' })
    return null
  }
}
