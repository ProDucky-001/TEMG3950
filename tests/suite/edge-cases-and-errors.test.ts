/**
 * Edge case and error recovery tests.
 * Covers invalid input, permission denial handling, and graceful degradation.
 */
import { LinkAnalyzer } from '../../src/main/services/LinkAnalyzer';
import { ScamDatabase } from '../../src/main/services/ScamDatabase';
import { AIContentDetector } from '../../src/main/services/ai-detection/AIContentDetector';
import { ContentScanner } from '../../src/main/services/ai-detection/ContentScanner';
import { ThreatType } from '../../src/shared/link-detection-types';
import { EMPTY_CONTENT } from '../fixtures/content-fixtures';
import { INVALID_URLS as INVALID_LINK_URLS } from '../fixtures/link-fixtures';

const edgeStoreMap = new Map<string, Map<string, unknown>>();
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
      edgeStoreMap.set(this.name, data);
    }
    get(key: string, def?: unknown) {
      const m = edgeStoreMap.get(this.name);
      const val = m?.get(key);
      return val !== undefined ? val : (def !== undefined ? def : this.defaults[key]);
    }
    set(key: string, value: unknown) {
      let m = edgeStoreMap.get(this.name);
      if (!m) {
        m = new Map();
        edgeStoreMap.set(this.name, m);
      }
      m.set(key, value);
    }
  },
}));

const getMockStore = () => require('electron-store').default;

describe('TestingSuite: edge cases', () => {
  describe('LinkAnalyzer invalid input', () => {
    it('should handle empty string URL', () => {
      const db = new ScamDatabase(getMockStore());
      const analyzer = new LinkAnalyzer(db);
      const result = analyzer.analyze('');
      expect(result.breakdown.some((b) => b.category === 'Invalid URL')).toBe(true);
    });

    it('should handle invalid URL format', () => {
      const db = new ScamDatabase(getMockStore());
      const analyzer = new LinkAnalyzer(db);
      for (const invalid of INVALID_LINK_URLS) {
        if (invalid.trim() === '') continue;
        const result = analyzer.analyze(invalid);
        expect(result).toBeDefined();
        expect(Array.isArray(result.breakdown)).toBe(true);
        expect(Array.isArray(result.recommendations)).toBe(true);
        expect(result.recommendations.length).toBeGreaterThan(0);
      }
    });
  });

  describe('ContentScanner edge cases', () => {
    it('should handle empty and whitespace content', () => {
      const scanner = new ContentScanner();
      for (const text of EMPTY_CONTENT) {
        const result = scanner.scan({ text });
        expect(result.confidence).toBe(0);
        expect(result.isAIgenerated).toBe(false);
      }
    });

    it('should handle very long input (truncation)', () => {
      const scanner = new ContentScanner();
      const long = 'word '.repeat(20000);
      const result = scanner.scan({ text: long });
      expect(result).toBeDefined();
      expect(typeof result.confidence).toBe('number');
    });
  });

  describe('Error recovery', () => {
    it('should return valid result shape even for invalid URL in LinkAnalyzer', () => {
      const db = new ScamDatabase(getMockStore());
      const analyzer = new LinkAnalyzer(db);
      const result = analyzer.analyze('not-a-url');
      expect(result).toMatchObject({
        breakdown: expect.any(Array),
        threatTypes: expect.any(Array),
        explanation: expect.any(String),
        recommendations: expect.any(Array),
      });
    });

    it('AIContentDetector should never throw for any string input', () => {
      const detector = new AIContentDetector();
      expect(() => detector.detect('')).not.toThrow();
      expect(() => detector.detect('x'.repeat(100000))).not.toThrow();
      expect(() => detector.detect('special \0 null \n\t')).not.toThrow();
    });
  });
});
