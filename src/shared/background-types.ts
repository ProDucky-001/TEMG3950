/**
 * Background service and system integration types.
 */

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PersistedWindowState {
  dashboard: WindowBounds | null
  settings: WindowBounds | null
  dashboardAlwaysOnTop?: boolean
}

export interface SystemEventMap {
  'sleep': void
  'wake': void
  'lock': void
  'unlock': void
  'online': void
  'offline': void
}

export type SystemEventType = keyof SystemEventMap
