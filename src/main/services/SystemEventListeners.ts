import { powerMonitor, session } from 'electron'
import type { SystemEventType } from '../../shared/background-types'
import { logger } from './logger'

type Listener = () => void

/**
 * Listens to system events: sleep/wake, network online/offline.
 */
export class SystemEventListeners {
  private listeners = new Map<SystemEventType, Set<Listener>>()
  private unsubscribePower: (() => void) | null = null
  private unsubscribeNet: (() => void) | null = null

  start(): void {
    this.setupPowerMonitor()
    this.setupNetworkListeners()
  }

  stop(): void {
    this.unsubscribePower?.()
    this.unsubscribePower = null
    this.unsubscribeNet?.()
    this.unsubscribeNet = null
    this.listeners.clear()
  }

  on(event: SystemEventType, callback: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(callback)
    return () => this.listeners.get(event)?.delete(callback)
  }

  private emit(event: SystemEventType): void {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb()
      } catch (err) {
        logger.warn('SystemEventListeners: handler error', event, err)
      }
    })
  }

  private setupPowerMonitor(): void {
    const onSuspend = () => this.emit('sleep')
    const onResume = () => this.emit('wake')
    powerMonitor.on('suspend', onSuspend)
    powerMonitor.on('resume', onResume)
    this.unsubscribePower = () => {
      powerMonitor.off('suspend', onSuspend)
      powerMonitor.off('resume', onResume)
    }
  }

  private setupNetworkListeners(): void {
    try {
      const defaultSession = session.defaultSession
      const onOnline = () => this.emit('online')
      const onOffline = () => this.emit('offline')
      defaultSession.on('online', onOnline)
      defaultSession.on('offline', onOffline)
      this.unsubscribeNet = () => {
        defaultSession.off('online', onOnline)
        defaultSession.off('offline', onOffline)
      }
    } catch (err) {
      logger.warn('SystemEventListeners: session not available', err)
    }
  }
}
