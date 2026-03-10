import { contextBridge, ipcRenderer } from 'electron'

export type OverlayState = 'monitoring' | 'processing'

export interface OverlayBounds {
  x: number
  y: number
  width: number
  height: number
  /** Scale factor for overlay (e.g. Retina). Use in overlay to convert logical bounds to viewport px. */
  pixelRatio?: number
}

export interface OverlayWindowData {
  bounds: OverlayBounds | null
  state: OverlayState
  appName: string
  windowTitle: string
}

contextBridge.exposeInMainWorld('overlayAPI', {
  onState: (callback: (state: OverlayState) => void) => {
    const handler = (_: unknown, state: OverlayState) => callback(state)
    ipcRenderer.on('overlay-state', handler)
    return () => ipcRenderer.removeListener('overlay-state', handler)
  },
  onRenderState: (callback: (state: OverlayState) => void) => {
    const handler = (_: unknown, state: OverlayState) => callback(state)
    ipcRenderer.on('render-state', handler)
    return () => ipcRenderer.removeListener('render-state', handler)
  },
  onBounds: (callback: (bounds: OverlayBounds | null) => void) => {
    const handler = (_: unknown, bounds: OverlayBounds | null) => callback(bounds)
    ipcRenderer.on('overlay-bounds', handler)
    return () => ipcRenderer.removeListener('overlay-bounds', handler)
  },
  onWindowData: (callback: (data: OverlayWindowData) => void) => {
    const handler = (_: unknown, data: OverlayWindowData) => callback(data)
    ipcRenderer.on('overlay-window-data', handler)
    return () => ipcRenderer.removeListener('overlay-window-data', handler)
  },
  onDebugLogEntry: (callback: (line: string) => void) => {
    const handler = (_: unknown, line: string) => callback(line)
    ipcRenderer.on('debug-log-entry', handler)
    return () => ipcRenderer.removeListener('debug-log-entry', handler)
  },
})
