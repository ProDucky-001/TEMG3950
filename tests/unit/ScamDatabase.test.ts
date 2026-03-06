/**
 * Unit tests for ScamDatabase.
 * Tests domain list, TLDs, keywords, recent detections, and reset.
 */
import { ScamDatabase } from '../../src/main/services/ScamDatabase';
import { ThreatType } from '../../src/shared/link-detection-types';

const scamDbStoreMap = new Map<string, Map<string, unknown>>();
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
      scamDbStoreMap.set(this.name, data);
    }
    get(key: string, def?: unknown) {
      const m = scamDbStoreMap.get(this.name);
      const val = m?.get(key);
      return val !== undefined ? val : (def !== undefined ? def : this.defaults[key]);
    }
    set(key: string, value: unknown) {
      let m = scamDbStoreMap.get(this.name);
      if (!m) {
        m = new Map();
        scamDbStoreMap.set(this.name, m);
      }
      m.set(key, value);
    }
  },
}));

const getMockStore = () => require('electron-store').default;

describe('ScamDatabase', () => {
  let db: ScamDatabase;

  beforeEach(() => {
    db = new ScamDatabase(getMockStore());
    db.reset();
  });

  describe('known malicious domains', () => {
    it('should add and detect malicious domain', () => {
      db.addMaliciousDomain('phish.example.tk', ThreatType.Phishing);
      const entry = db.isDomainKnownMalicious('phish.example.tk');
      expect(entry).toBeDefined();
      expect(entry?.threatType).toBe(ThreatType.Phishing);
    });

    it('should normalize www prefix when checking', () => {
      db.addMaliciousDomain('evil.com', ThreatType.Malware);
      expect(db.isDomainKnownMalicious('www.evil.com')).toBeDefined();
    });

    it('should not duplicate when adding same domain again', () => {
      db.addMaliciousDomain('dup.com', ThreatType.Phishing);
      db.addMaliciousDomain('dup.com', ThreatType.Scam);
      const list = db.getKnownMaliciousDomains();
      const dupEntries = list.filter((e) => e.domain === 'dup.com');
      expect(dupEntries.length).toBe(1);
    });
  });

  describe('suspicious TLDs', () => {
    it('should recognize .tk, .xyz, .work as suspicious', () => {
      expect(db.isSuspiciousTld('.tk')).toBe(true);
      expect(db.isSuspiciousTld('.xyz')).toBe(true);
      expect(db.isSuspiciousTld('.work')).toBe(true);
    });

    it('should accept TLD with or without leading dot', () => {
      expect(db.isSuspiciousTld('tk')).toBe(true);
      expect(db.isSuspiciousTld('.tk')).toBe(true);
    });
  });

  describe('phishing keywords and scam phrases', () => {
    it('should return default lists and allow add', () => {
      const kw = db.getPhishingKeywords();
      const phrases = db.getScamPhrases();
      expect(kw.length).toBeGreaterThan(0);
      expect(phrases.length).toBeGreaterThan(0);
      db.addPhishingKeyword('customkw');
      expect(db.getPhishingKeywords()).toContain('customkw');
      db.addScamPhrase('custom phrase');
      expect(db.getScamPhrases()).toContain('custom phrase');
    });
  });

  describe('recent detections', () => {
    it('should add and return recent detections', () => {
      db.addRecentDetection({
        url: 'https://bad.com',
        riskScore: 80,
        threatTypes: [ThreatType.Phishing],
      });
      const recent = db.getRecentDetections();
      expect(recent.length).toBeGreaterThanOrEqual(1);
      expect(recent[0].url).toBe('https://bad.com');
      expect(recent[0].riskScore).toBe(80);
    });
  });

  describe('reset', () => {
    it('should clear custom data and restore defaults', () => {
      db.addMaliciousDomain('x.com', ThreatType.Phishing);
      db.addPhishingKeyword('foo');
      const afterReset = db.reset();
      expect(db.isDomainKnownMalicious('x.com')).toBeUndefined();
      expect(db.getPhishingKeywords()).not.toContain('foo');
      expect(afterReset.knownMaliciousDomains).toEqual([]);
    });
  });
});
