/**
 * Normalizes application names for consistent display and logging.
 * Uses bundle ID mapping and Title Case so we get "Chrome", "Safari", "Cursor" from process.
 * Keep processName (app) and windowTitle (window) separate everywhere.
 */

/** Bundle identifier → display name (system localized name when known). */
export const BUNDLE_ID_TO_DISPLAY_NAME: Record<string, string> = {
  'com.google.Chrome': 'Google Chrome',
  'com.microsoft.edgemac': 'Microsoft Edge',
  'com.apple.Safari': 'Safari',
  'com.apple.mail': 'Mail',
  'com.microsoft.Outlook': 'Microsoft Outlook',
  'com.microsoft.VSCode': 'Visual Studio Code',
  'com.todesktop.230313mzl4w4u92': 'Cursor',
  'com.todesktop.230313mzl4w4u92a': 'Cursor',
  'com.github.electron': 'Electron',
  'com.github.electron.framework': 'Electron',
}

/** Process name (lowercase) → display name when bundle ID is not available. */
export const PROCESS_NAME_TO_DISPLAY_NAME: Record<string, string> = {
  'google chrome': 'Google Chrome',
  chrome: 'Chrome',
  safari: 'Safari',
  edge: 'Microsoft Edge',
  'microsoft edge': 'Microsoft Edge',
  mail: 'Mail',
  outlook: 'Microsoft Outlook',
  'microsoft outlook': 'Microsoft Outlook',
  electron: 'Electron',
  cursor: 'Cursor',
  'visual studio code': 'Visual Studio Code',
  code: 'Visual Studio Code',
}

/**
 * Converts a string to Title Case (first letter of each word uppercase, rest lowercase).
 * Handles all-caps and all-lowercase process names.
 */
export function toTitleCase(s: string): string {
  if (!s || typeof s !== 'string') return ''
  const t = s.trim()
  if (!t) return ''
  return t
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return word
      return word[0].toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Returns a consistent display name for the app.
 * 1) If bundleId is provided and in map, use that.
 * 2) Else if processName (lowercased) is in process-name map, use that.
 * 3) Else apply Title Case to processName.
 * Always trims and treats empty as "unknown".
 */
export function normalizeAppName(
  processName: string | null | undefined,
  bundleId?: string | null
): string {
  const raw = (processName ?? '').toString().trim()
  if (!raw) return 'unknown'

  if (bundleId && typeof bundleId === 'string') {
    const bid = bundleId.trim()
    const mapped = BUNDLE_ID_TO_DISPLAY_NAME[bid]
    if (mapped) return mapped
  }

  const lower = raw.toLowerCase()
  const fromProcessMap = PROCESS_NAME_TO_DISPLAY_NAME[lower]
  if (fromProcessMap) return fromProcessMap

  return toTitleCase(raw)
}
