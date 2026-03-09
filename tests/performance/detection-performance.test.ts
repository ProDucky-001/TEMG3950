/**
 * Performance tests for tiered detection: Tier 1 < 10ms, cache, priority, pipeline targets.
 * Run with: npm run test -- --testPathPattern="detection-performance"
 */
import { TieredDetectionSystem } from '../../src/main/detection/TieredDetectionSystem'
import { DetectionCache } from '../../src/main/utils/DetectionCache'
import { PriorityManager } from '../../src/main/detection/PriorityManager'
import type { WindowInfo } from '../../src/main/detection/types'
import type { AppContextResult } from '../../src/main/integration/AppContextDetector'
import { ContentExtractor } from '../../src/main/integration/ContentExtractor'
import { OCRProcessor } from '../../src/main/services/OCRProcessor'
import { LinkScanner } from '../../src/main/services/LinkScanner'
import { ContentScanner } from '../../src/main/services/ai-detection/ContentScanner'
import { ApplicationIntegrator } from '../../src/main/integration/ApplicationIntegrator'

const mockLinkScanner: LinkScanner = {
  scan: jest.fn().mockResolvedValue({ url: 'https://example.com', riskScore: 0, explanation: 'OK' }),
}
const mockContentScanner: ContentScanner = {
  scan: jest.fn().mockReturnValue({ scamIndicators: [], confidence: 0 }),
}
const integrator = new ApplicationIntegrator(mockLinkScanner, mockContentScanner)
const extractor = new ContentExtractor()

describe('Detection performance', () => {
  describe('Tier 1 quick check < 10ms', () => {
    it('tier1QuickCheck completes in under 10ms', async () => {
      const ocr = new OCRProcessor()
      const extractor = new ContentExtractor()
      const tiered = new TieredDetectionSystem(ocr, extractor, integrator)
      const context: AppContextResult = {
        isEmailClientActive: true,
        appId: 'gmail',
        context: 'inbox',
        browserUrl: 'https://mail.google.com',
        windowName: 'Gmail',
      }
      const start = performance.now()
      const result = await tiered.tier1QuickCheck(context)
      const duration = performance.now() - start
      expect(duration).toBeLessThan(10)
      expect(result.isEmail).toBe(true)
      expect(result.appType).toBe('gmail')
      await ocr.terminate()
    })
  })

  describe('DetectionCache', () => {
    it('get/set and windowKey are fast', () => {
      const cache = new DetectionCache(30_000)
      const key = DetectionCache.windowKey('Chrome', { x: 10, y: 20, width: 800, height: 600 })
      const start = performance.now()
      cache.set(key, { isEmail: true })
      const hit = cache.get<{ isEmail: boolean }>(key)
      const duration = performance.now() - start
      expect(hit?.isEmail).toBe(true)
      expect(duration).toBeLessThan(5)
    })

    it('expires after TTL', () => {
      const cache = new DetectionCache(10)
      cache.set('k', { x: 1 })
      expect(cache.get('k')).not.toBeNull()
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(cache.get('k')).toBeNull()
          resolve()
        }, 20)
      })
    })
  })

  describe('PriorityManager', () => {
    it('getPriority and getPollingInterval are fast', () => {
      const pm = new PriorityManager()
      const windowInfo: WindowInfo = {
        owner: { name: 'Microsoft Outlook' },
        bounds: { x: 0, y: 0, width: 1024, height: 768 },
        appType: 'outlook',
      }
      const start = performance.now()
      const priority = pm.getPriority(windowInfo)
      const interval = pm.getPollingInterval(priority)
      const hash = pm.hashWindow(windowInfo)
      const shouldScan = pm.shouldScan(windowInfo)
      const duration = performance.now() - start
      expect(priority).toBe('high')
      expect(interval).toBe(300)
      expect(hash).toContain('outlook')
      expect(shouldScan).toBe(true)
      expect(duration).toBeLessThan(5)
    })
  })

  describe('URL pattern match target < 5ms', () => {
    it('tier1 result reflects pattern match only (no OCR)', async () => {
      const ocr = new OCRProcessor()
      const tiered = new TieredDetectionSystem(ocr, extractor, integrator)
      const context: AppContextResult = {
        isEmailClientActive: false,
        appId: 'chrome',
        context: 'unknown',
        browserUrl: null,
        windowName: 'Chrome',
      }
      const start = performance.now()
      const result = await tiered.tier1QuickCheck(context)
      const duration = performance.now() - start
      expect(duration).toBeLessThan(5)
      expect(result.isEmail).toBe(false)
      await ocr.terminate()
    })
  })
})

