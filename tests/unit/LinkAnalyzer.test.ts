/**
 * Unit tests for LinkAnalyzer.
 * Tests various URL patterns including known phishing, suspicious TLDs, typosquatting, and legitimate URLs.
 */
import { LinkAnalyzer } from '../../src/main/services/LinkAnalyzer';
import { ScamDatabase } from '../../src/main/services/ScamDatabase';
import { ThreatType } from '../../src/shared/link-detection-types';
import {
  PHISHING_URLS,
  LEGITIMATE_URLS,
  INVALID_URLS,
  TYPOSQUAT_SAMPLES,
} from '../fixtures/link-fixtures';

const linkScamDbStoreMap = new Map<string, Map<string, unknown>>();
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
      linkScamDbStoreMap.set(this.name, data);
    }
    get(key: string, def?: unknown) {
      const m = linkScamDbStoreMap.get(this.name);
      const val = m?.get(key);
      return val !== undefined ? val : (def !== undefined ? def : this.defaults[key]);
    }
    set(key: string, value: unknown) {
      let m = linkScamDbStoreMap.get(this.name);
      if (!m) {
        m = new Map();
        linkScamDbStoreMap.set(this.name, m);
      }
      m.set(key, value);
    }
  },
}));

const getMockStore = () => require('electron-store').default;

describe('LinkAnalyzer', () => {
  let scamDb: ScamDatabase;
  let analyzer: LinkAnalyzer;

  beforeEach(() => {
    scamDb = new ScamDatabase(getMockStore());
    scamDb.reset();
    analyzer = new LinkAnalyzer(scamDb);
  });

  describe('known malicious domains', () => {
    it('should flag domain when it is in the threat database', () => {
      scamDb.addMaliciousDomain('evil-phish.tk', ThreatType.Phishing);
      const result = analyzer.analyze('https://evil-phish.tk/login');
      expect(result.threatTypes).toContain(ThreatType.Phishing);
      expect(result.breakdown.some((b) => b.category === 'Known malicious domain')).toBe(true);
    });

    it('should include threat type from database in breakdown', () => {
      scamDb.addMaliciousDomain('malware-site.xyz', ThreatType.Malware);
      const result = analyzer.analyze('https://malware-site.xyz/download');
      expect(result.threatTypes).toContain(ThreatType.Malware);
    });
  });

  describe('suspicious TLDs', () => {
    it('should flag .tk as suspicious TLD', () => {
      const result = analyzer.analyze('https://example.tk/path');
      expect(result.threatTypes).toContain(ThreatType.Suspicious);
      expect(result.breakdown.some((b) => b.category === 'Suspicious TLD')).toBe(true);
    });

    it('should flag .xyz and .work as suspicious', () => {
      expect(analyzer.analyze('https://site.xyz/page').threatTypes).toContain(ThreatType.Suspicious);
      expect(analyzer.analyze('https://site.work/page').threatTypes).toContain(ThreatType.Suspicious);
    });
  });

  describe('URL shorteners', () => {
    it('should flag bit.ly and similar shorteners', () => {
      const result = analyzer.analyze('https://bit.ly/abc123');
      expect(result.breakdown.some((b) => b.category === 'URL shortener')).toBe(true);
    });
  });

  describe('IP address in URL', () => {
    it('should flag IPv4 address in hostname', () => {
      const result = analyzer.analyze('https://192.168.1.1/login');
      expect(result.breakdown.some((b) => b.category === 'IP address in URL')).toBe(true);
    });
  });

  describe('login/credential parameters', () => {
    it('should flag URLs with login or password parameters', () => {
      const result = analyzer.analyze('https://example.com/signin?login=user&password=secret');
      expect(result.breakdown.some((b) => b.category === 'Login/credential parameters')).toBe(true);
      expect(result.threatTypes).toContain(ThreatType.Phishing);
    });
  });

  describe('financial and scam keywords', () => {
    it('should flag financial keywords in path', () => {
      const result = analyzer.analyze('https://example.com/wire-transfer');
      expect(result.breakdown.some((b) => b.category === 'Financial keywords')).toBe(true);
    });

    it('should flag prize/lottery patterns', () => {
      const result = analyzer.analyze('https://example.com/claim-winner-prize');
      expect(result.breakdown.some((b) => b.category === 'Prize/lottery patterns')).toBe(true);
    });
  });

  describe('invalid URLs', () => {
    it('should return Invalid URL breakdown for invalid format', () => {
      const result = analyzer.analyze('not-a-valid-url');
      expect(result.breakdown.some((b) => b.category === 'Invalid URL')).toBe(true);
      expect(result.threatTypes).toContain(ThreatType.Suspicious);
    });
  });

  describe('legitimate URLs (false positive check)', () => {
    it('should not over-flag clean Google and GitHub URLs', () => {
      const google = analyzer.analyze(LEGITIMATE_URLS[0]);
      const github = analyzer.analyze(LEGITIMATE_URLS[1]);
      expect(google.breakdown.some((b) => b.category === 'Known malicious domain')).toBe(false);
      expect(github.breakdown.some((b) => b.category === 'Known malicious domain')).toBe(false);
    });
  });

  describe('output shape', () => {
    it('should return explanation and recommendations', () => {
      scamDb.addMaliciousDomain('bad.tk', ThreatType.Phishing);
      const result = analyzer.analyze('https://bad.tk/login');
      expect(typeof result.explanation).toBe('string');
      expect(result.explanation.length).toBeGreaterThan(0);
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });
});
