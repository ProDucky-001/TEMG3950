/**
 * Normalized active window info used across the detection layer.
 * Maps from active-win Result (and platform-specific fields like url).
 */
export interface ActiveWindowInfo {
  title: string
  url?: string
  owner: {
    name: string
    processId: number
    path?: string
    bundleId?: string
  }
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  platform?: 'macos' | 'windows' | 'linux'
}
