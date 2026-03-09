import { clipboard } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { HoverDetectorResult } from '../../shared/detection-types'

const execAsync = promisify(exec)

const POLL_INTERVAL_MS = 50
const HOVER_QUERY_INTERVAL_MS = 100
const CLIPBOARD_POLL_MS = 200
const MAX_URL_LENGTH = 2048

function looksLikeUrl(text: string): boolean {
  if (!text || text.length > MAX_URL_LENGTH) return false
  const t = text.trim()
  if (/^https?:\/\/\S+$/i.test(t)) return true
  if (/^[a-z0-9][\w.-]*\.[a-z]{2,}(\/.*)?$/i.test(t)) return true
  return false
}

function normalizeToUrl(text: string): string | null {
  const t = text.trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  if (/^[a-z0-9][\w.-]*\.[a-z]{2,}/i.test(t)) return 'https://' + t
  return null
}

/**
 * On macOS, try to get the URL of the focused link (AXFocusedUIElement -> AXURL).
 * Works in some browsers (e.g. Safari/Chrome) when a link has focus; not guaranteed for Firefox.
 */
async function getFocusedLinkUrlMacOS(): Promise<string | null> {
  if (process.platform !== 'darwin') return null
  try {
    const script = `osascript -e '
      tell application "System Events"
        set frontApp to name of first process whose frontmost is true
      end tell
      if frontApp is "" then return ""
      tell application "System Events" to tell process frontApp
        try
          set foc to value of attribute "AXFocusedUIElement" of first window
          if foc is missing value then return ""
          set u to value of attribute "AXURL" of foc
          if u is missing value then return ""
          return u as text
        on error
          return ""
        end try
      end tell
    ' 2>/dev/null`
    const { stdout } = await execAsync(script, { timeout: 300 })
    const url = (stdout ?? '').trim()
    return normalizeToUrl(url) ?? null
  } catch {
    return null
  }
}

/**
 * Hover and clipboard link detection for scam/phishing awareness.
 * - Clipboard: poll for changes; if content looks like a URL, include it.
 * - Hovered link: on macOS, use accessibility (AXFocusedUIElement/AXURL) as a proxy for
 *   "focused link" (true hover-under-cursor would require a native helper).
 * - Runs at 50ms poll interval with internal throttling for accessibility queries to limit CPU.
 * - Optional: pass isBrowserFocused () => boolean to only run hover detection when a browser is front.
 */
export class HoverDetector {
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private lastHoverUrl: string | null = null
  private lastResult: HoverDetectorResult = {
    hoveredUrl: null,
    clipboardContent: null,
    timestamp: 0,
  }
  private listeners = new Set<(result: HoverDetectorResult) => void>()
  private lastHoverQueryTime = 0
  private isRunning = false

  constructor(
    /** When provided, hover (accessibility) query runs only when this returns true (e.g. browser is front). */
    private readonly isBrowserFocused?: () => boolean
  ) {}

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.tick()
    this.pollTimer = setInterval(() => this.tick(), POLL_INTERVAL_MS)
  }

  stop(): void {
    this.isRunning = false
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.lastHoverUrl = null
  }

  getLastResult(): HoverDetectorResult {
    return { ...this.lastResult }
  }

  onUpdate(callback: (result: HoverDetectorResult) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  private async tick(): Promise<void> {
    const now = Date.now()
    const rawClip = clipboard.readText()
    const clipboardContent = looksLikeUrl(rawClip) ? normalizeToUrl(rawClip) : null

    let hoveredUrl: string | null = null
    if (now - this.lastHoverQueryTime >= HOVER_QUERY_INTERVAL_MS) {
      const runHover = this.isBrowserFocused == null || this.isBrowserFocused()
      if (runHover) {
        this.lastHoverQueryTime = now
        hoveredUrl = await getFocusedLinkUrlMacOS()
        if (hoveredUrl) this.lastHoverUrl = hoveredUrl
        else this.lastHoverUrl = null
      } else {
        this.lastHoverUrl = null
        hoveredUrl = null
      }
    } else {
      hoveredUrl = this.lastHoverUrl
    }

    const result: HoverDetectorResult = {
      hoveredUrl,
      clipboardContent,
      timestamp: now,
    }

    const changed =
      result.hoveredUrl !== this.lastResult.hoveredUrl ||
      result.clipboardContent !== this.lastResult.clipboardContent
    this.lastResult = result
    if (changed) {
      for (const cb of this.listeners) cb(result)
    }
  }
}
