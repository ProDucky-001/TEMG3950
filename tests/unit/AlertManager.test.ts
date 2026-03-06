/**
 * Unit tests for AlertManager.
 * Tests notification delivery, storage, and preferences (quiet hours, focus mode).
 */
import { AlertManager } from '../../src/main/managers/AlertManager';
import type { AlertPreferences } from '../../src/shared/types';

const alertStoreData = new Map<string, Map<string, unknown>>();
jest.mock('electron-store', () => ({
  __esModule: true,
  default: class Store {
    private name: string;
    private defaults: Record<string, unknown>;
    constructor(opts: { name: string; defaults: Record<string, unknown> }) {
      this.name = opts.name;
      this.defaults = opts.defaults || {};
      if (!alertStoreData.has(this.name)) {
        alertStoreData.set(this.name, new Map(Object.entries(this.defaults)));
      }
    }
    get(key: string, def?: unknown) {
      const m = alertStoreData.get(this.name);
      return (m && m.get(key)) ?? def ?? (this.defaults[key] as unknown);
    }
    set(key: string, value: unknown) {
      let m = alertStoreData.get(this.name);
      if (!m) {
        m = new Map();
        alertStoreData.set(this.name, m);
      }
      m.set(key, value);
    }
  },
}));
jest.mock('../../src/main/managers/AlertPresenter', () => ({
  AlertPresenter: jest.fn().mockImplementation(() => ({
    present: jest.fn(),
    flushBatch: jest.fn(),
  })),
}));

const getMockStore = () => require('electron-store').default;

describe('AlertManager', () => {
  const mockOpenDashboard = jest.fn();
  const mockOpenSettings = jest.fn();
  const mockOnAlertPushed = jest.fn();

  const defaultPrefs: AlertPreferences = {
    soundEnabled: true,
    notificationType: 'banner',
    desktopNotifications: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    focusModeEnabled: false,
  };

  let getSettings: () => { alertPreferences: AlertPreferences };
  let manager: AlertManager;

  beforeEach(() => {
    jest.clearAllMocks();
    getSettings = jest.fn(() => ({ alertPreferences: defaultPrefs }));
    manager = new AlertManager(getMockStore(), {
      getSettings,
      onOpenDashboard: mockOpenDashboard,
      onOpenSettings: mockOpenSettings,
      onAlertPushed: mockOnAlertPushed,
    });
  });

  describe('addAlert', () => {
    it('should store alert and return it with id and timestamp', () => {
      const input = {
        type: 'phishing' as const,
        severity: 'high' as const,
        source: 'test',
        message: 'Test alert',
      };
      const added = manager.addAlert(input);
      expect(added.id).toBeDefined();
      expect(added.id).toMatch(/^alert-/);
      expect(added.timestamp).toBeGreaterThan(0);
      expect(added.type).toBe('phishing');
      expect(added.severity).toBe('high');
      expect(added.message).toBe('Test alert');
    });

    it('should include new alert in getAlerts', () => {
      manager.addAlert({
        type: 'suspicious_link',
        severity: 'medium',
        source: 'unit-test',
        message: 'Sample',
      });
      const alerts = manager.getAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts[0].message).toBe('Sample');
    });

    it('should call onAlertPushed when provided', () => {
      manager.addAlert({
        type: 'phishing',
        severity: 'critical',
        source: 'test',
        message: 'Pushed',
      });
      expect(mockOnAlertPushed).toHaveBeenCalledTimes(1);
      expect(mockOnAlertPushed).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Pushed' })
      );
    });
  });

  describe('clearAlerts', () => {
    it('should remove all alerts', () => {
      manager.addAlert({
        type: 'phishing',
        severity: 'low',
        source: 'a',
        message: 'One',
      });
      manager.clearAlerts();
      expect(manager.getAlerts()).toHaveLength(0);
    });
  });

  describe('getAlertsLast30Days and getAlertStats', () => {
    it('should return last 30 days and stats from history manager', () => {
      manager.addAlert({
        type: 'phishing',
        severity: 'high',
        source: 'test',
        message: 'For stats',
      });
      const last30 = manager.getAlertsLast30Days();
      const stats = manager.getAlertStats();
      expect(Array.isArray(last30)).toBe(true);
      expect(stats).toBeDefined();
      expect(typeof stats.total).toBe('number');
      expect(stats.bySeverity).toBeDefined();
    });
  });

  describe('export', () => {
    it('should export JSON string', () => {
      const json = manager.exportAlertsJSON();
      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should export CSV string', () => {
      const csv = manager.exportAlertsCSV();
      expect(typeof csv).toBe('string');
    });
  });
});
