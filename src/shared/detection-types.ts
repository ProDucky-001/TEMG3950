/**
 * Detection state exposed to renderer via IPC.
 */

export type EmailAppStatus = 'idle' | 'detected' | 'analyzing' | 'threat-found'

export interface DetectionState {
  status: EmailAppStatus
  activeApp: string | null
  appType: 'webmail' | 'desktop' | null
  url?: string
  lastChecked: string
  threatLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical'
  bounds?: { x: number; y: number; width: number; height: number }
  windowTitle?: string
}

export interface DetectionSettings {
  pollingIntervalMs?: number
}

/** Snapshot from window tracker: app name, title, URL (when browser), bounds, email flag. */
export interface WindowTrackerSnapshot {
  appName: string
  windowTitle: string
  url: string | null
  bounds: { x: number; y: number; width: number; height: number }
  isEmail: boolean
}

/** Hover/clipboard detection result for link scanning. */
export interface HoverDetectorResult {
  hoveredUrl: string | null
  clipboardContent: string | null
  timestamp: number
}
