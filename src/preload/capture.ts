import { contextBridge, ipcRenderer } from 'electron'

export interface CapturePreloadAPI {
  getSources: (opts: { types: ('window' | 'screen')[] }) => Promise<Array<{ id: string; name: string }>>
  sendResult: (buffer: ArrayBuffer, error?: string) => void
  onCaptureRequest: (callback: (preferWindowId?: string) => void) => () => void
}

const api: CapturePreloadAPI = {
  getSources: async (opts) => {
    return ipcRenderer.invoke('capture-get-sources', opts) as Promise<Array<{ id: string; name: string }>>
  },
  sendResult: (buffer, error) => ipcRenderer.send('capture-result', Buffer.from(buffer), error),
  onCaptureRequest: (callback) => {
    const handler = (_: unknown, preferWindowId?: string) => callback(preferWindowId)
    ipcRenderer.on('capture-request', handler)
    return () => ipcRenderer.removeListener('capture-request', handler)
  },
}

contextBridge.exposeInMainWorld('captureAPI', api)
