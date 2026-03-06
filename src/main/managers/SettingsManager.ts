import type { StoreClass } from './storeLoader'
import { DEFAULT_SETTINGS } from '../../shared/constants'
import type { Settings } from '../../shared/types'

export class SettingsManager {
  private store: InstanceType<StoreClass>

  constructor(Store: StoreClass) {
    this.store = new Store({
      name: 'scamshield-settings',
      defaults: {
        settings: DEFAULT_SETTINGS,
      },
    }) as InstanceType<StoreClass>
  }

  getSettings(): Settings {
    return this.store.get('settings')
  }

  updateSettings(updates: Partial<Settings>): Settings {
    const current = this.store.get('settings')
    const updated = { ...current, ...updates }
    this.store.set('settings', updated)
    return updated
  }

  resetSettings(): Settings {
    this.store.set('settings', DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }
}
