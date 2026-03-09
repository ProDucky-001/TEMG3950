import type { ActiveWindowInfo } from './ActiveWindowInfo'
import { isEmailApplication } from './EmailPatterns'
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const execFileAsync = promisify(execFileCb)
const DEBOUNCE_MS = 80
const DEFAULT_POLLING_INTERVAL_MS = 100

/**
 * Continuously tracks the active window using the active-win package.
 * Polls every 100ms for responsive overlay tracking.
 * Debounce is kept short (80ms) so focus changes are relayed within ~200ms.
 */
export class ActiveWindowMonitor {
  private pollingIntervalMs = DEFAULT_POLLING_INTERVAL_MS
  private isRunning = false
  private lastWindowInfo: ActiveWindowInfo | null = null
  private listeners = new Set<(info: ActiveWindowInfo | null) => void>()
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingInfo: ActiveWindowInfo | null = null
  private activeWinModule: { activeWindow: (options?: Record<string, unknown>) => Promise<any> } | null = null
  private macosBinaryPath: string | null = null

  /**
   * Start monitoring the active window. Uses active-win (dynamic import for ESM).
   */
  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.tick()
    this.pollTimer = setInterval(() => this.tick(), this.pollingIntervalMs)
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    this.isRunning = false
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.pendingInfo = null
    this.lastWindowInfo = null
  }

  /**
   * Get the current active window info (cached from last poll).
   */
  getCurrentWindow(): ActiveWindowInfo | null {
    return this.lastWindowInfo
  }

  /**
   * Whether the macOS binary has ever returned null or thrown since start (used to show accessibility dialog).
   */
  hasEverSeenBinaryFailure(): boolean {
    return this._hasEverSeenBinaryFailure
  }

  /**
   * Set a one-shot callback when the macOS binary first returns null or throws. Used to show accessibility dialog.
   */
  setOnBinaryFailure(callback: () => void): void {
    this.onBinaryFailureCallback = callback
  }

  /**
   * Register a callback for window change events.
   */
  onWindowChange(callback: (info: ActiveWindowInfo | null) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  /**
   * Set polling interval in milliseconds (minimum 50ms).
   */
  setPollingInterval(ms: number): void {
    this.pollingIntervalMs = Math.max(50, ms)
    if (this.isRunning && this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = setInterval(() => this.tick(), this.pollingIntervalMs)
    }
  }

  /**
   * Check if the current window is an email application (webmail or desktop).
   */
  isEmailAppActive(): ReturnType<typeof isEmailApplication> {
    if (!this.lastWindowInfo) return { isEmail: false, appType: null, appName: null }
    return isEmailApplication(this.lastWindowInfo)
  }

  private async tick(): Promise<void> {
    try {
      const info = await this.getActiveWindowInfo()
      if (!info) {
        if (this.lastWindowInfo !== null) {
          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
            this.debounceTimer = null
          }
          this.pendingInfo = null
          this.lastWindowInfo = null
          for (const cb of this.listeners) cb(null)
        }
        return
      }
      const changed = this.windowChanged(this.lastWindowInfo, info)
      this.lastWindowInfo = info
      if (!changed) return
      this.pendingInfo = info
      this.scheduleDebouncedNotify()
    } catch {
      // active-win can throw if permissions are missing or platform unsupported
    }
  }

  private windowChanged(a: ActiveWindowInfo | null, b: ActiveWindowInfo | null): boolean {
    if (a === b) return false
    if (!a || !b) return true
    if (a.owner.processId !== b.owner.processId) return true
    if (a.title !== b.title) return true
    if ((a.url ?? '') !== (b.url ?? '')) return true
    const ba = a.bounds
    const bb = b.bounds
    return ba.x !== bb.x || ba.y !== bb.y || ba.width !== bb.width || ba.height !== bb.height
  }

  private scheduleDebouncedNotify(): void {
    if (this.debounceTimer) return
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      const info = this.pendingInfo
      this.pendingInfo = null
      if (info) {
        this.lastWindowInfo = info
        for (const cb of this.listeners) cb(info)
      }
    }, DEBOUNCE_MS)
  }

  private async getActiveWindowInfoMacOS(): Promise<any> {
    if (!this.macosBinaryPath) {
      const req = createRequire(__filename)
      const pkgMain = req.resolve('active-win')
      this.macosBinaryPath = join(dirname(pkgMain), 'main')
      console.log('[ActiveWindowMonitor] using macOS binary at:', this.macosBinaryPath)
    }
    const { stdout } = await execFileAsync(this.macosBinaryPath, ['--no-screen-recording-permission'])
    const parsed = JSON.parse(stdout)
    if (!parsed && !this._loggedMacosResultOnce) {
      this._loggedMacosResultOnce = true
      // #region agent log
      fetch('http://127.0.0.1:7799/ingest/2f9d4b64-93fa-4b9d-8d61-3e63f5789b0d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b6709'},body:JSON.stringify({sessionId:'2b6709',location:'ActiveWindowMonitor:getActiveWindowInfoMacOS',message:'binary returned falsy',data:{stdoutLength:stdout.length,stdoutPreview:stdout.slice(0,200),parsedType:typeof parsed},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
    }
    if (parsed) {
      this._loggedMacosResultOnce = false
      return parsed
    }
    this._hasEverSeenBinaryFailure = true
    if (this.onBinaryFailureCallback && !this._binaryFailureNotified) {
      this._binaryFailureNotified = true
      this.onBinaryFailureCallback()
    }
    const fallback = await this.getFrontmostAppAppleScriptFallback()
    if (fallback) {
      // #region agent log
      fetch('http://127.0.0.1:7799/ingest/2f9d4b64-93fa-4b9d-8d61-3e63f5789b0d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b6709'},body:JSON.stringify({sessionId:'2b6709',location:'ActiveWindowMonitor:getActiveWindowInfoMacOS',message:'used AppleScript fallback',data:{appName:fallback.owner.name},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
      // #endregion
      return fallback
    }
    return null
  }

  /** When active-win binary returns null (no Accessibility), try AppleScript to get frontmost app name so detection still works. */
  private async getFrontmostAppAppleScriptFallback(): Promise<ActiveWindowInfo | null> {
    try {
      const { stdout } = await execFileAsync('osascript', [
        '-e',
        'tell application "System Events" to get name of first process whose frontmost is true',
      ], { encoding: 'utf8' })
      const name = (stdout ?? '').trim()
      if (!name) return null
      return {
        title: '',
        owner: { name, processId: 0 },
        bounds: { x: 0, y: 0, width: 800, height: 600 },
        platform: 'darwin',
      }
    } catch {
      return null
    }
  }

  private async getActiveWindowInfo(): Promise<ActiveWindowInfo | null> {
    try {
      let result: any
      if (process.platform === 'darwin') {
        result = await this.getActiveWindowInfoMacOS()
      } else {
        if (!this.activeWinModule) {
          this.activeWinModule = await import('active-win')
          console.log('[ActiveWindowMonitor] active-win module loaded successfully')
        }
        result = await this.activeWinModule.activeWindow({
          accessibilityPermission: true,
          screenRecordingPermission: false,
        })
      }
      if (!result) {
        if (process.platform === 'darwin') {
          this._hasEverSeenBinaryFailure = true
          if (this.onBinaryFailureCallback && !this._binaryFailureNotified) {
            this._binaryFailureNotified = true
            this.onBinaryFailureCallback()
          }
        }
        if (!this._loggedNullOnce) {
          console.warn('[ActiveWindowMonitor] active-win returned null — check Accessibility permission')
          this._loggedNullOnce = true
        }
        return null
      }
      this._loggedNullOnce = false
      this._loggedErrorOnce = false
      const url = 'url' in result ? result.url : undefined
      const info = {
        title: result.title ?? '',
        url,
        owner: {
          name: result.owner.name ?? '',
          processId: result.owner.processId,
          path: result.owner.path,
          bundleId: 'bundleId' in result.owner ? result.owner.bundleId : undefined,
        },
        bounds: { ...result.bounds },
        platform: result.platform ?? process.platform,
      }
      return info
    } catch (err) {
      if (process.platform === 'darwin') {
        this._hasEverSeenBinaryFailure = true
        if (this.onBinaryFailureCallback && !this._binaryFailureNotified) {
          this._binaryFailureNotified = true
          this.onBinaryFailureCallback()
        }
        const fallback = await this.getFrontmostAppAppleScriptFallback()
        if (fallback) {
          // #region agent log
          fetch('http://127.0.0.1:7799/ingest/2f9d4b64-93fa-4b9d-8d61-3e63f5789b0d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b6709'},body:JSON.stringify({sessionId:'2b6709',location:'ActiveWindowMonitor:getActiveWindowInfo',message:'used AppleScript fallback after catch',data:{appName:fallback.owner.name},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
          // #endregion
          return fallback
        }
      }
      if (!this._loggedErrorOnce) {
        this._loggedErrorOnce = true
        // #region agent log
        fetch('http://127.0.0.1:7799/ingest/2f9d4b64-93fa-4b9d-8d61-3e63f5789b0d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b6709'},body:JSON.stringify({sessionId:'2b6709',location:'ActiveWindowMonitor:getActiveWindowInfo',message:'catch',data:{err:String(err),code:(err as NodeJS.ErrnoException)?.code},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        console.error('[ActiveWindowMonitor] active-win error:', err)
      }
      return null
    }
  }
  private _loggedNullOnce = false
  private _loggedErrorOnce = false
  private _loggedMacosResultOnce = false
  private _hasEverSeenBinaryFailure = false
  private onBinaryFailureCallback: (() => void) | null = null
  private _binaryFailureNotified = false
}
