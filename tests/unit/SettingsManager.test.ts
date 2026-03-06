/**
 * Unit tests for SettingsManager.
 * Tests persistence (via mocked electron-store), get/update/reset.
 */
import { SettingsManager } from '../../src/main/managers/SettingsManager';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';
import type { Settings } from '../../src/shared/types';

const settingsStoreMap = new Map<string, Map<string, unknown>>();
jest.mock('electron-store', () => {
  return {
    __esModule: true,
    default: class Store {
      private name: string;
      private data: Map<string, unknown>;
      private defaults: Record<string, unknown>;
      constructor(opts: { name: string; defaults: Record<string, unknown> }) {
        this.name = opts.name;
        this.defaults = opts.defaults || {};
        this.data = new Map(Object.entries(this.defaults));
        settingsStoreMap.set(this.name, this.data);
      }
      get(key: string, def?: unknown) {
        return this.data.get(key) ?? def ?? this.defaults[key];
      }
      set(key: string, value: unknown) {
        this.data.set(key, value);
      }
    },
  };
});

const getMockStore = () => require('electron-store').default;

describe('SettingsManager', () => {
  let manager: SettingsManager;

  beforeEach(() => {
    manager = new SettingsManager(getMockStore());
  });

  describe('getSettings', () => {
    it('should return default-like settings when fresh', () => {
      const settings = manager.getSettings();
      expect(settings).toBeDefined();
      expect(settings.monitoringEnabled).toBeDefined();
      expect(Array.isArray(settings.monitoredApps)).toBe(true);
      expect(settings.alertPreferences).toBeDefined();
      expect(settings.sensitivity).toBeDefined();
    });
  });

  describe('updateSettings', () => {
    it('should merge partial updates and return full settings', () => {
      const updated = manager.updateSettings({ monitoringEnabled: false });
      expect(updated.monitoringEnabled).toBe(false);
      const again = manager.getSettings();
      expect(again.monitoringEnabled).toBe(false);
    });

    it('should update nested alertPreferences', () => {
      manager.updateSettings({
        alertPreferences: {
          ...manager.getSettings().alertPreferences,
          soundEnabled: false,
          quietHoursEnabled: true,
        },
      });
      const s = manager.getSettings();
      expect(s.alertPreferences.soundEnabled).toBe(false);
      expect(s.alertPreferences.quietHoursEnabled).toBe(true);
    });

    it('should update monitoredApps', () => {
      const apps = manager.getSettings().monitoredApps;
      const toggled = apps.map((a) =>
        a.id === apps[0].id ? { ...a, enabled: false } : a
      );
      manager.updateSettings({ monitoredApps: toggled });
      const first = manager.getSettings().monitoredApps.find((a) => a.id === apps[0].id);
      expect(first?.enabled).toBe(false);
    });
  });

  describe('resetSettings', () => {
    it('should restore defaults and return them', () => {
      manager.updateSettings({ monitoringEnabled: false, sensitivity: 'high' });
      const reset = manager.resetSettings();
      expect(reset.monitoringEnabled).toBe(DEFAULT_SETTINGS.monitoringEnabled);
      expect(reset.sensitivity).toBe(DEFAULT_SETTINGS.sensitivity);
      expect(manager.getSettings().sensitivity).toBe(DEFAULT_SETTINGS.sensitivity);
    });
  });
});
