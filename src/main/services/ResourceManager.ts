import { powerMonitor } from 'electron'

/** Polling interval when on AC power (ms). */
const POLL_INTERVAL_AC = 2000
/** Polling interval when on battery (ms) - reduced to save battery. */
const POLL_INTERVAL_BATTERY = 8000

export interface ResourceManagerOptions {
  onIntervalChange?: (intervalMs: number) => void
}

/**
 * Manages resource usage: battery-aware polling and optional throttling.
 */
export class ResourceManager {
  private onIntervalChange?: (intervalMs: number) => void
  private _currentIntervalMs = POLL_INTERVAL_AC
  private batteryUnsubscribe: (() => void) | null = null

  constructor(options: ResourceManagerOptions = {}) {
    this.onIntervalChange = options.onIntervalChange
  }

  start(): void {
    this.updateInterval()
    try {
      powerMonitor.on('on-ac', () => {
        this._currentIntervalMs = POLL_INTERVAL_AC
        this.onIntervalChange?.(this._currentIntervalMs)
      })
      powerMonitor.on('on-battery', () => {
        this._currentIntervalMs = POLL_INTERVAL_BATTERY
        this.onIntervalChange?.(this._currentIntervalMs)
      })
      this.batteryUnsubscribe = () => {
        powerMonitor.removeAllListeners('on-ac')
        powerMonitor.removeAllListeners('on-battery')
      }
    } catch {
      this._currentIntervalMs = POLL_INTERVAL_AC
    }
  }

  stop(): void {
    this.batteryUnsubscribe?.()
    this.batteryUnsubscribe = null
  }

  getPollingIntervalMs(): number {
    return this._currentIntervalMs
  }

  private updateInterval(): void {
    this._currentIntervalMs = POLL_INTERVAL_AC
    this.onIntervalChange?.(this._currentIntervalMs)
  }
}
