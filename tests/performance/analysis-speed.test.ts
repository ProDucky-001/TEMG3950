/**
 * Performance tests: analysis speed benchmarks.
 * Run with: npm run test -- --testPathPattern="performance"
 */
import { LinkAnalyzer } from '../../src/main/services/LinkAnalyzer';
import { ScamDatabase } from '../../src/main/services/ScamDatabase';
import { AIContentDetector } from '../../src/main/services/ai-detection/AIContentDetector';

const perfStoreMap = new Map<string, Map<string, unknown>>();
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
      perfStoreMap.set(this.name, data);
    }
    get(key: string, def?: unknown) {
      const m = perfStoreMap.get(this.name);
      const val = m?.get(key);
      return val !== undefined ? val : (def !== undefined ? def : this.defaults[key]);
    }
    set(key: string, value: unknown) {
      let m = perfStoreMap.get(this.name);
      if (!m) {
        m = new Map();
        perfStoreMap.set(this.name, m);
      }
      m.set(key, value);
    }
  },
}));

const getMockStore = () => require('electron-store').default;

const ITERATIONS = 100;

describe('Performance: analysis speed', () => {
  it('LinkAnalyzer.analyze completes within acceptable time per call', () => {
    const db = new ScamDatabase(getMockStore());
    const analyzer = new LinkAnalyzer(db);
    const url = 'https://example.com/path?login=1';
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      analyzer.analyze(url);
    }
    const msPerCall = (performance.now() - start) / ITERATIONS;
    expect(msPerCall).toBeLessThan(50);
    console.log(`  LinkAnalyzer.analyze: ${msPerCall.toFixed(3)} ms/call (${ITERATIONS} runs)`);
  });

  it('AIContentDetector.detect completes within acceptable time for medium text', () => {
    const detector = new AIContentDetector();
    const text = 'In conclusion, it is important to note that leveraging a comprehensive approach can facilitate robust outcomes. '.repeat(20);
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      detector.detect(text);
    }
    const msPerCall = (performance.now() - start) / ITERATIONS;
    expect(msPerCall).toBeLessThan(100);
    console.log(`  AIContentDetector.detect: ${msPerCall.toFixed(3)} ms/call (${ITERATIONS} runs)`);
  });
});
