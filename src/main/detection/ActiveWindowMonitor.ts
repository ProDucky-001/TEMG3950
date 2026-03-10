import type { ActiveWindowInfo } from './ActiveWindowInfo'
import { isEmailApplication } from './EmailPatterns'
import { normalizeAppName } from '../utils/appNameNormalizer'
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from '../services/logger'
import type { PlatformSpecificManager } from '../integration/PlatformSpecificManager'
import { screen } from 'electron'

const execFileAsync = promisify(execFileCb)
const DETECTION_INTERVAL_MS = 2000
const DEBOUNCE_MS = 0

/**
 * Tracks the active window. On macOS uses only AppleScript (no active-win).
 * When a PlatformSpecificManager is provided, uses its AppleScript-based
 * getFrontmostWindowBounds() so overlay and downstream processing get real window bounds.
 */
export class ActiveWindowMonitor {
  private pollingIntervalMs = DETECTION_INTERVAL_MS
  private isRunning = false
  private lastWindowInfo: ActiveWindowInfo | null = null
  private listeners = new Set<(info: ActiveWindowInfo | null) => void>()
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingInfo: ActiveWindowInfo | null = null
  private activeWinModule: { activeWindow: (options?: Record<string, unknown>) => Promise<any> } | null = null

  constructor(private readonly platform?: PlatformSpecificManager) {}

  /**
   * Start monitoring the active window. On macOS uses AppleScript only; on Windows uses active-win.
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
   * Whether we have ever successfully obtained window info (AppleScript on macOS, active-win elsewhere).
   */
  isAvailable(): boolean {
    return this._hasEverSucceeded
  }

  /**
   * On macOS (AppleScript-only): true if we ever got null from AppleScript (e.g. no Accessibility).
   */
  hasEverSeenBinaryFailure(): boolean {
    return this._hasEverSeenBinaryFailure
  }

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
   * Set polling interval in milliseconds (minimum DETECTION_INTERVAL_MS).
   */
  setPollingInterval(ms: number): void {
    this.pollingIntervalMs = Math.max(DETECTION_INTERVAL_MS, ms)
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

  private async getActiveWindowInfoMacOS(): Promise<ActiveWindowInfo | null> {
    return this.getFrontmostAppAppleScriptFallback()
  }

  /** Get frontmost app and optional window title on macOS using only AppleScript (no active-win).
   * When platform is provided, also fetches real window bounds via platform.getFrontmostWindowBounds()
   * (AppleScript AXFrame/position+size) for overlay and further processing.
   */
  private async getFrontmostAppAppleScriptFallback(): Promise<ActiveWindowInfo | null> {
    try {
      const { stdout } = await execFileAsync('osascript', [
        '-e',
        'tell application "System Events" to get name of first process whose frontmost is true',
      ], { encoding: 'utf8' })
      const processName = (stdout ?? '').trim()
      if (!processName) {
        this._hasEverSeenBinaryFailure = true
        if (this.onBinaryFailureCallback && !this._binaryFailureNotified) {
          this._binaryFailureNotified = true
          this.onBinaryFailureCallback()
        }
        return null
      }
      let title = ''
      try {
        const { stdout: titleOut } = await execFileAsync('osascript', [
          '-e',
          `tell application "System Events"
            set p to first process whose frontmost is true
            try
              return name of window 1 of p
            end try
            return ""
          end tell`,
        ], { encoding: 'utf8' })
        title = (titleOut ?? '').trim()
      } catch {
        // ignore
      }
      let bounds: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: 800, height: 600 }
      if (this.platform && process.platform === 'darwin') {
        try {
          const primary = screen.getPrimaryDisplay()
          const raw = await this.platform.getFrontmostWindowBounds(primary.bounds.height)
          if (raw && raw.width >= 50 && raw.height >= 50) bounds = raw
        } catch {
          // keep placeholder bounds
        }
      }
      this._hasEverSucceeded = true
      const name = normalizeAppName(processName, undefined)
      return {
        title,
        owner: { name, processId: 0 },
        bounds,
        platform: 'darwin',
      }
    } catch {
      this._hasEverSeenBinaryFailure = true
      if (this.onBinaryFailureCallback && !this._binaryFailureNotified) {
        this._binaryFailureNotified = true
        this.onBinaryFailureCallback()
      }
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
        return null
      }
      this._loggedErrorOnce = false
      this._hasEverSucceeded = true
      if (process.platform === 'darwin') {
        return result as ActiveWindowInfo
      }
      const url = result && 'url' in result ? result.url : undefined
      const rawOwner = result?.owner
      const rawBounds = result?.bounds
      const ownerName = normalizeAppName(rawOwner?.name, rawOwner && 'bundleId' in rawOwner ? rawOwner.bundleId : undefined)
      const info: ActiveWindowInfo = {
        title: (result?.title ?? '').trim(),
        url,
        owner: {
          name: ownerName,
          processId: rawOwner?.processId ?? 0,
          path: rawOwner?.path,
          bundleId: rawOwner && 'bundleId' in rawOwner ? rawOwner.bundleId : undefined,
        },
        bounds: {
          x: typeof rawBounds?.x === 'number' ? rawBounds.x : 0,
          y: typeof rawBounds?.y === 'number' ? rawBounds.y : 0,
          width: typeof rawBounds?.width === 'number' ? rawBounds.width : 800,
          height: typeof rawBounds?.height === 'number' ? rawBounds.height : 600,
        },
        platform: (result?.platform ?? process.platform) as ActiveWindowInfo['platform'],
      }
      return info
    } catch (err) {
      if (process.platform !== 'darwin') {
        this._hasEverSeenBinaryFailure = true
        if (this.onBinaryFailureCallback && !this._binaryFailureNotified) {
          this._binaryFailureNotified = true
          this.onBinaryFailureCallback()
        }
      }
      if (!this._loggedErrorOnce) {
        this._loggedErrorOnce = true
        logger.error('ActiveWindowMonitor: getActiveWindowInfo failed', err)
      }
      return null
    }
  }
  private _loggedErrorOnce = false
  private _hasEverSeenBinaryFailure = false
  private _hasEverSucceeded = false
  private onBinaryFailureCallback: (() => void) | null = null
  private _binaryFailureNotified = false
}
