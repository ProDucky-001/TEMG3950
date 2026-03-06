import type { StoreClass } from '../storeLoader'
import type { PersistedWindowState, WindowBounds } from '../../shared/background-types'

const STORE_KEY = 'scamshield-window-state'

export class WindowStateStore {
  private store: InstanceType<StoreClass>

  constructor(Store: StoreClass) {
    this.store = new Store({
      name: STORE_KEY,
      defaults: {
        dashboard: null,
        settings: null,
        dashboardAlwaysOnTop: false,
      },
    }) as InstanceType<StoreClass>
  }

  getDashboardBounds(): WindowBounds | null {
    return this.store.get('dashboard') ?? null
  }

  setDashboardBounds(bounds: WindowBounds): void {
    this.store.set('dashboard', bounds)
  }

  getSettingsBounds(): WindowBounds | null {
    return this.store.get('settings') ?? null
  }

  setSettingsBounds(bounds: WindowBounds): void {
    this.store.set('settings', bounds)
  }

  getDashboardAlwaysOnTop(): boolean {
    return this.store.get('dashboardAlwaysOnTop') ?? false
  }

  setDashboardAlwaysOnTop(value: boolean): void {
    this.store.set('dashboardAlwaysOnTop', value)
  }
}
