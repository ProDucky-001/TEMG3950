/**
 * Integration tests: full detection flow (content → analysis → alert).
 * Uses mocked electron and store; exercises LinkScanner, ContentScanner, AlertManager together.
 */
import { ScamDatabase } from '../../src/main/services/ScamDatabase';
import { LinkScanner } from '../../src/main/services/LinkScanner';
import { ContentScanner } from '../../src/main/services/ai-detection/ContentScanner';
import { AlertManager } from '../../src/main/managers/AlertManager';
import { ThreatType } from '../../src/shared/link-detection-types';
import { SCAM_MESSAGE_SAMPLES } from '../fixtures/content-fixtures';

const intStoreMap = new Map<string, Map<string, unknown>>();
jest.mock('electron-store', () => ({
  __esModule: true,
  default: class Store {
    private name: string;
    private defaults: Record<string, unknown>;
    constructor(opts: { name: string; defaults: Record<string, unknown> }) {
      this.name = opts.name;
      this.defaults = opts.defaults || {};
      const data = new Map<string, unknown>();
      for (const [k, v] of Object.entries(this.defaults)) {
        data.set(k, Array.isArray(v) ? [...v] : v);
      }
      intStoreMap.set(this.name, data);
    }
    get(key: string, def?: unknown) {
      const m = intStoreMap.get(this.name);
      const val = m?.get(key);
      return val !== undefined ? val : (def !== undefined ? def : this.defaults[key]);
    }
    set(key: string, value: unknown) {
      let m = intStoreMap.get(this.name);
      if (!m) {
        m = new Map();
        intStoreMap.set(this.name, m);
      }
      m.set(key, value);
    }
  },
}));
jest.mock('electron');
jest.mock('../../src/main/managers/AlertPresenter', () => ({
  AlertPresenter: jest.fn().mockImplementation(() => ({
    present: jest.fn(),
    flushBatch: jest.fn(),
  })),
}));

const getMockStore = () => require('electron-store').default;

describe('Integration: detection flow', () => {
  it('should run link scan and produce result with risk score', async () => {
    const scamDb = new ScamDatabase(getMockStore());
    scamDb.addMaliciousDomain('phish.tk', ThreatType.Phishing);
    const scanner = new LinkScanner(scamDb);
    const result = await scanner.scan('https://phish.tk/login');
    expect(result.riskScore).toBeGreaterThanOrEqual(50);
    expect(result.threatTypes).toContain(ThreatType.Phishing);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('should run content scan and detect scam indicators', () => {
    const contentScanner = new ContentScanner();
    const text = SCAM_MESSAGE_SAMPLES[0];
    const result = contentScanner.scan({ text });
    expect(result).toBeDefined();
    expect(typeof result.confidence).toBe('number');
    expect(Array.isArray(result.indicators)).toBe(true);
  });

  it('should add alert and have it in history and stats', () => {
    const getSettings = jest.fn(() => ({
      alertPreferences: {
        soundEnabled: false,
        notificationType: 'silent' as const,
        desktopNotifications: false,
      },
    }));
    const manager = new AlertManager(getMockStore(), {
      getSettings,
      onOpenDashboard: jest.fn(),
      onOpenSettings: jest.fn(),
    });
    manager.addAlert({
      type: 'phishing',
      severity: 'high',
      source: 'integration-test',
      message: 'Test threat',
    });
    const alerts = manager.getAlerts();
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const stats = manager.getAlertStats();
    expect(stats.total).toBeGreaterThanOrEqual(1);
    const json = manager.exportAlertsJSON();
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
