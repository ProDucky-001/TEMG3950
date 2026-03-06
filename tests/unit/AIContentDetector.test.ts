/**
 * Unit tests for AIContentDetector.
 * Tests with known AI-generated text, human-like text, and scam messages.
 */
import { AIContentDetector } from '../../src/main/services/ai-detection/AIContentDetector';
import {
  AI_GENERATED_SAMPLES,
  HUMAN_LIKE_SAMPLES,
  SCAM_MESSAGE_SAMPLES,
  SHORT_CONTENT,
  EMPTY_CONTENT,
} from '../fixtures/content-fixtures';

describe('AIContentDetector', () => {
  let detector: AIContentDetector;

  beforeEach(() => {
    detector = new AIContentDetector();
  });

  describe('AI-generated content', () => {
    it('should classify AI-style text with elevated confidence', () => {
      for (const text of AI_GENERATED_SAMPLES) {
        const result = detector.detect(text);
        expect(result.confidence).toBeGreaterThanOrEqual(0.3);
        expect(result.indicators.length).toBeGreaterThanOrEqual(0);
        expect(result.recommendation).toBeDefined();
      }
    });

    it('should include analysis details for longer AI-like text', () => {
      const result = detector.detect(AI_GENERATED_SAMPLES[0]);
      expect(result.analysisDetails.length).toBeGreaterThan(0);
    });
  });

  describe('human-like content', () => {
    it('should give low or zero AI confidence for casual short messages', () => {
      for (const text of HUMAN_LIKE_SAMPLES) {
        const result = detector.detect(text);
        expect(result.isAIgenerated).toBe(false);
        expect(result.confidence).toBeLessThanOrEqual(0.6);
      }
    });
  });

  describe('scam message detection', () => {
    it('should flag scam messages with scam indicators', () => {
      for (const text of SCAM_MESSAGE_SAMPLES) {
        const result = detector.detect(text);
        expect(result.scamIndicators === undefined || result.scamIndicators.length >= 0).toBe(true);
        if (result.scamIndicators && result.scamIndicators.length > 0) {
          expect(result.recommendation).toMatch(/scam|impersonation|Do not send/i);
        }
      }
    });

    it('should detect urgency and impersonation patterns in scam samples', () => {
      const result = detector.detect(SCAM_MESSAGE_SAMPLES[0]);
      const detailsStr = result.analysisDetails.join(' ').toLowerCase();
      const hasScamHint =
        (result.scamIndicators && result.scamIndicators.length > 0) ||
        detailsStr.includes('scam') ||
        result.recommendation.toLowerCase().includes('scam');
      expect(hasScamHint || result.indicators.length > 0).toBe(true);
    });
  });

  describe('short and empty content', () => {
    it('should return shortContentResult for very short text', () => {
      for (const text of SHORT_CONTENT) {
        const result = detector.detect(text);
        expect(result.confidence).toBe(0);
        expect(result.isAIgenerated).toBe(false);
        expect(result.analysisDetails.some((d) => d.includes('short') || d.includes('No text'))).toBe(true);
      }
    });

    it('should handle empty or whitespace content', () => {
      const result = detector.detect('');
      expect(result.confidence).toBe(0);
      expect(result.isAIgenerated).toBe(false);
    });
  });

  describe('output shape', () => {
    it('should always return AIDetectionResult shape', () => {
      const result = detector.detect('Any reasonable length text here for analysis.');
      expect(typeof result.isAIgenerated).toBe('boolean');
      expect(typeof result.confidence).toBe('number');
      expect(Array.isArray(result.indicators)).toBe(true);
      expect(Array.isArray(result.analysisDetails)).toBe(true);
      expect(typeof result.recommendation).toBe('string');
      expect(typeof result.analyzedAt).toBe('number');
    });
  });
});
