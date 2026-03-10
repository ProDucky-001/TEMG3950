/**
 * Window tracker service module — single entry point for active window detection.
 *
 * Provides:
 * - active-win–based window metadata (app name, title, bounds)
 * - Browser URL extraction (Chrome, Safari) with fallbacks:
 *   platform getCurrentBrowserUrl(), then URL-from-window-title when AppleScript fails
 * - Email application detection (Apple Mail, Outlook, Thunderbird, webmail)
 * - 100ms polling with 80ms debounce to avoid UI flicker
 * - Cached last-known window to detect real changes
 *
 * Return shape:
 * {
 *   appName: string,
 *   windowTitle: string,
 *   url: string | null,
 *   bounds: { x, y, width, height },
 *   isEmail: boolean
 * }
 */

import type { ActiveWindowMonitor } from '../detection/ActiveWindowMonitor'
import type { PlatformSpecificManager } from '../integration/PlatformSpecificManager'
import { WindowTrackerService as WindowTrackerServiceImpl } from './WindowTrackerService'
import type { WindowTrackerSnapshot } from '../../shared/detection-types'

export type { WindowTrackerSnapshot }

export { WindowTrackerServiceImpl as WindowTrackerService }

/**
 * Create a window tracker that uses active-win (or fallback) and enriches browser URLs.
 * Call start() to begin polling; use getCurrentSnapshot() and onWindowChange() for data.
 */
export function createWindowTracker(
  activeWindowMonitor: ActiveWindowMonitor,
  platform: PlatformSpecificManager
): WindowTrackerServiceImpl {
  return new WindowTrackerServiceImpl(activeWindowMonitor, platform)
}
