/**
 * Local OCR engine using Tesseract.js. No external APIs.
 * - Loads English trained data; initializes worker on startup.
 * - Pre-OCR: grayscale, contrast, thresholding for white/grey/black backgrounds.
 * - Post-OCR: clean errors, first 100 chars for debug, structured result with confidence.
 * - Completes within 1 second (timeout); runs in Tesseract worker; cache to avoid redundant work.
 */

import { createWorker } from 'tesseract.js'
import { logger } from '../services/logger'
import { preprocessForOCR, cleanOCRText } from '../detection/imagePreprocess'

const OCR_TIMEOUT_MS = 1000
const CACHE_TTL_MS = 2000
const DEBUG_PREVIEW_LEN = 100
const MIN_IMAGE_BYTES = 500
const MIN_PNG_WIDTH = 100
const MIN_PNG_HEIGHT = 30

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export interface OCREngineResult {
  text: string
  confidence: number
  debugPreview: string
  /** Raw text before cleanOCRText (for debugging). */
  rawText?: string
}

export interface OCREngineOptions {
  /** Timeout per recognize() in ms. Default 1000. */
  timeoutMs?: number
}

function getPngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (!buf || buf.length < 24) return null
  if (buf.compare(PNG_SIGNATURE, 0, 8, 0, 8) !== 0) return null
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  }
}

function hashBuffer(buf: Buffer): string {
  let h = 0
  const step = Math.max(1, Math.floor(buf.length / 1000))
  for (let i = 0; i < buf.length; i += step) {
    h = ((h << 5) - h + buf[i]) | 0
  }
  return String(h)
}

/**
 * OCR engine: Tesseract.js local-only, with pre/post processing and cache.
 */
export class OCREngine {
  private worker: Awaited<ReturnType<typeof createWorker>> | null = null
  private initPromise: Promise<void> | null = null
  private lastHash: string | null = null
  private lastResult: OCREngineResult | null = null
  private lastTimestamp = 0
  private busy = false
  private readonly timeoutMs: number

  constructor(options: OCREngineOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? OCR_TIMEOUT_MS
  }

  /**
   * Initialize Tesseract worker (English, local only). Call on app startup to reduce latency.
   */
  async initialize(): Promise<void> {
    if (this.worker) return
    if (this.initPromise) return this.initPromise
    this.initPromise = (async () => {
      try {
        const w = await createWorker('eng', 1, { logger: () => {} })
        this.worker = w
      } catch (err) {
        logger.error('OCREngine: failed to create worker', err)
        this.initPromise = null
        throw err
      }
    })()
    await this.initPromise
    this.initPromise = null
  }

  /**
   * Preprocess image for OCR (grayscale, contrast).
   */
  async preprocess(imageBuffer: Buffer): Promise<Buffer> {
    if (!imageBuffer || imageBuffer.length < MIN_IMAGE_BYTES) return imageBuffer
    return preprocessForOCR(imageBuffer)
  }

  /**
   * Run OCR on image buffer. Returns structured result with confidence and debug preview.
   * Uses cache when same image within CACHE_TTL_MS; completes within timeoutMs.
   */
  async recognize(
    imageBuffer: Buffer | Uint8Array | ArrayBuffer
  ): Promise<OCREngineResult> {
    const buf = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer as ArrayBuffer)
    if (buf.length < MIN_IMAGE_BYTES) {
      return { text: '', confidence: 0, debugPreview: '' }
    }
    const dims = getPngDimensions(buf)
    if (dims && (dims.width < MIN_PNG_WIDTH || dims.height < MIN_PNG_HEIGHT)) {
      return { text: '', confidence: 0, debugPreview: '' }
    }

    const hash = hashBuffer(buf)
    const now = Date.now()
    if (hash === this.lastHash && now - this.lastTimestamp < CACHE_TTL_MS && this.lastResult) {
      return this.lastResult
    }

    if (this.busy) {
      return this.lastResult ?? { text: '', confidence: 0, debugPreview: '' }
    }

    this.busy = true
    const timeout = this.timeoutMs
    try {
      await this.initialize()
      const preprocessed = await this.preprocess(buf)
      const worker = this.worker!
      const run = () =>
        worker.recognize(preprocessed, { tessedit_pageseg_mode: '6' }).then(({ data }) => ({
          text: (data?.text ?? '').trim(),
          confidence: data?.confidence ?? 0,
        }))

      const result = await Promise.race([
        run(),
        new Promise<{ text: string; confidence: number }>((_, rej) =>
          setTimeout(() => rej(new Error('OCR timeout')), timeout)
        ),
      ])

      const rawText = result.text
      const text = cleanOCRText(rawText)
      const debugPreview = text.replace(/\s+/g, ' ').trim().slice(0, DEBUG_PREVIEW_LEN)
      const out: OCREngineResult = {
        text,
        confidence: result.confidence,
        debugPreview,
        rawText: rawText !== text ? rawText : undefined,
      }
      this.lastHash = hash
      this.lastResult = out
      this.lastTimestamp = Date.now()
      return out
    } catch (err) {
      logger.warn('OCREngine: recognize failed', err)
      return { text: '', confidence: 0, debugPreview: '' }
    } finally {
      this.busy = false
    }
  }

  clearCache(): void {
    this.lastHash = null
    this.lastResult = null
    this.lastTimestamp = 0
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate()
      } catch (e) {
        logger.debug('OCREngine: terminate error', e)
      }
      this.worker = null
    }
    this.initPromise = null
    this.clearCache()
  }
}
