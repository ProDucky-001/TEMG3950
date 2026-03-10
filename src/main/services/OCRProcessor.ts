/**
 * OCR: Apple Vision Framework on macOS (memory-based, M2 Neural Engine), Tesseract.js elsewhere.
 * - macOS: @cherrystudio/mac-system-ocr (VNRecognizeTextRequest, accurate level, en-US, buffer in memory).
 * - Post-process: clean whitespace, preserve paragraph structure, first 100 chars for logging.
 * - 2s cache to avoid re-OCR of same frame.
 */

import { createWorker } from 'tesseract.js'
import { logger } from './logger'

const OCR_CACHE_MS = 2000
const MIN_IMAGE_BYTES = 5000
const MIN_PNG_WIDTH = 100
const MIN_PNG_HEIGHT = 30
const DEBUG_PREVIEW_LEN = 100

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Tesseract/Leptonica stderr filter (used only when Tesseract path runs). */
let stderrFilterRefCount = 0
const TESSERACT_STDERR_BLACKLIST =
  /Image too small|Line cannot be recognized|Error in pix|Scaling pix of size|Bad pix from ImageData/
function installStderrFilter(): void {
  if (stderrFilterRefCount++ > 0) return
  const orig = process.stderr.write.bind(process.stderr)
  ;(process.stderr as unknown as { _tesseractOrigWrite?: typeof process.stderr.write })._tesseractOrigWrite = orig
  process.stderr.write = function (
    this: NodeJS.WriteStream,
    ...args: Parameters<typeof process.stderr.write>
  ): boolean {
    const chunk = args[0]
    const s =
      typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk)
    if (TESSERACT_STDERR_BLACKLIST.test(s)) {
      const cb =
        args.length >= 1 && typeof args[args.length - 1] === 'function'
          ? (args[args.length - 1] as (err?: Error) => void)
          : undefined
      if (cb) cb()
      return true
    }
    return orig.apply(process.stderr, args)
  } as typeof process.stderr.write
}
function uninstallStderrFilter(): void {
  if (stderrFilterRefCount <= 0) return
  stderrFilterRefCount--
  if (stderrFilterRefCount > 0) return
  const orig = (process.stderr as unknown as { _tesseractOrigWrite?: typeof process.stderr.write })
    ._tesseractOrigWrite
  if (orig) {
    process.stderr.write = orig
    delete (process.stderr as unknown as { _tesseractOrigWrite?: typeof process.stderr.write })
      ._tesseractOrigWrite
  }
}

function getPngDimensions(buf: Buffer | Uint8Array | ArrayBuffer): { width: number; height: number } | null {
  if (!buf || (buf as Buffer).length < 24) return null
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer | SharedArrayBuffer)
  if (b.compare(PNG_SIGNATURE, 0, 8, 0, 8) !== 0) return null
  return {
    width: b.readUInt32BE(16),
    height: b.readUInt32BE(20),
  }
}

/**
 * Clean extra whitespace but preserve paragraph structure (Vision outputs line breaks).
 * Collapse multiple spaces to one; normalize line breaks to \n; keep paragraph breaks.
 */
function normalizeWhitespacePreserveParagraphs(text: string): string {
  if (!text || text.length < 2) return text
  return text
    .replace(/\r\n|\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Fix common OCR misreads in URL bar text. Applied after Vision/Tesseract. */
function postProcessOCRText(text: string): string {
  if (!text || text.length < 2) return text
  let t = text
  const fixes: [RegExp, string][] = [
    [/\bmai\.google\b/gi, 'mail.google'],
    [/\bmai1\.google\b/gi, 'mail.google'],
    [/\bmail\.googte\b/gi, 'mail.google'],
    [/\bmail\.goog1e\b/gi, 'mail.google'],
    [/\boutlok\b/gi, 'outlook'],
    [/\bout\s*look\b/gi, 'outlook'],
    [/\boutlook\.live\b/gi, 'outlook.live'],
    [/\boutlook\.office\b/gi, 'outlook.office'],
    [/\boutlook\.off1ce\b/gi, 'outlook.office'],
    [/\boutlook\.cloud\b/gi, 'outlook.cloud'],
    [/\brnicrosoft\b/gi, 'microsoft'],
    [/\bmircrosoft\b/gi, 'microsoft'],
    [/\bmicr0soft\b/gi, 'microsoft'],
    [/\boff1ce\.com\b/gi, 'office.com'],
    [/\bgrnail\b/gi, 'gmail'],
    [/\bgrnait\b/gi, 'gmail'],
    [/\bgmai1\b/gi, 'gmail'],
    [/\bgoogte\.com\b/gi, 'google.com'],
    [/\bgoog1e\.com\b/gi, 'google.com'],
    [/\bgoog1e\.com\/mail\b/gi, 'google.com/mail'],
    [/\binbox\s*\/\s*mail/gi, 'inbox/mail'],
    [/\binbox\s*-\s*/gi, 'Inbox - '],
    [/\bInbox\s*-\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+)/g, 'Inbox - $1'],
    [/\bG\s*Search\s*Google\b/gi, 'Google Search'],
    [/\bSearch\s*mail\b/gi, 'Search mail'],
    [/\bImagess?\s*~~/gi, 'Images'],
    [/\bBR\s*\]\s*~/g, ''],
    [/\s*[=:]+\s*$/g, ''],
  ]
  for (const [re, replacement] of fixes) {
    t = t.replace(re, replacement)
  }
  return normalizeWhitespacePreserveParagraphs(t)
}

/** Lazy-loaded Vision OCR module (darwin only). undefined = not tried, null = failed, object = loaded. */
let visionOCRModule: typeof import('@cherrystudio/mac-system-ocr') | null | undefined = undefined
function getVisionOCR(): typeof import('@cherrystudio/mac-system-ocr') | null {
  if (process.platform !== 'darwin') return null
  if (visionOCRModule !== undefined) return visionOCRModule
  try {
    visionOCRModule = require('@cherrystudio/mac-system-ocr')
    return visionOCRModule
  } catch {
    visionOCRModule = null
    return null
  }
}

const TESSERACT_PSM_LINE = '7'
const TESSERACT_PSM_BLOCK = '6'
const LOW_CONFIDENCE_THRESHOLD = 55

/**
 * Runs OCR: Vision on macOS (buffer in memory, accurate level, en-US), Tesseract elsewhere.
 * Same interface as before for ScreenCaptureManager and TieredDetectionSystem.
 */
export class OCRProcessor {
  private worker: Awaited<ReturnType<typeof createWorker>> | null = null
  private initPromise: Promise<void> | null = null
  private lastHash: string | null = null
  private lastText = ''
  private lastTimestamp = 0
  private busy = false
  private useVision = process.platform === 'darwin' && getVisionOCR() !== null

  private static hashBuffer(buf: Buffer): string {
    let h = 0
    const step = Math.max(1, Math.floor(buf.length / 1000))
    for (let i = 0; i < buf.length; i += step) {
      h = ((h << 5) - h + buf[i]) | 0
    }
    return String(h)
  }

  private async getWorker(): Promise<Awaited<ReturnType<typeof createWorker>>> {
    if (this.worker) return this.worker
    if (this.initPromise) return this.initPromise.then(() => this.worker!)
    this.initPromise = (async () => {
      try {
        const w = await createWorker('eng', 1, { logger: () => {} })
        installStderrFilter()
        this.worker = w
      } catch (err) {
        logger.error('OCRProcessor: failed to create Tesseract worker', err)
        this.initPromise = null
        throw err
      }
    })()
    await this.initPromise
    this.initPromise = null
    return this.worker!
  }

  private async recognizeVision(buf: Buffer): Promise<string> {
    const MacOCR = getVisionOCR()
    if (!MacOCR) throw new Error('Vision OCR not available')
    const result = await MacOCR.recognizeFromBuffer(buf, {
      recognitionLevel: MacOCR.RECOGNITION_LEVEL_ACCURATE,
      languages: 'en-US',
      minConfidence: 0,
    })
    const raw = (result?.text ?? '').trim()
    return normalizeWhitespacePreserveParagraphs(raw)
  }

  private async recognizeTesseract(buf: Buffer): Promise<string> {
    const worker = await this.getWorker()
    const runWithPSM = async (psm: string) => {
      const { data } = await worker.recognize(buf, { tessedit_pageseg_mode: psm })
      return { text: (data?.text ?? '').trim(), confidence: data?.confidence ?? 0 }
    }
    let { text: raw, confidence } = await runWithPSM(TESSERACT_PSM_LINE)
    if (confidence < LOW_CONFIDENCE_THRESHOLD && raw.length > 0) {
      const block = await runWithPSM(TESSERACT_PSM_BLOCK)
      if (block.confidence > confidence && block.text.length >= raw.length * 0.5) {
        raw = block.text
      }
    }
    return raw
  }

  async recognize(imageBuffer: Buffer | Uint8Array | ArrayBuffer): Promise<string> {
    if (!imageBuffer || (imageBuffer as Buffer).length < MIN_IMAGE_BYTES) return ''
    const buf =
      Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer as ArrayBuffer | SharedArrayBuffer)
    const dims = getPngDimensions(buf)
    if (dims && (dims.width < MIN_PNG_WIDTH || dims.height < MIN_PNG_HEIGHT)) return ''
    const hash = OCRProcessor.hashBuffer(buf)
    const now = Date.now()
    if (hash === this.lastHash && now - this.lastTimestamp < OCR_CACHE_MS) return this.lastText
    if (this.busy) return this.lastText || ''
    this.busy = true
    try {
      let raw: string
      if (this.useVision) {
        try {
          raw = await this.recognizeVision(buf)
        } catch (err) {
          logger.debug('OCRProcessor: Vision failed, falling back to Tesseract', err)
          raw = await this.recognizeTesseract(buf)
        }
      } else {
        raw = await this.recognizeTesseract(buf)
      }
      const text = postProcessOCRText(raw)
      this.lastHash = hash
      this.lastText = text
      this.lastTimestamp = Date.now()
      return text
    } catch (err) {
      logger.warn('OCRProcessor: recognize failed', err)
      return ''
    } finally {
      this.busy = false
    }
  }

  getDebugPreview(text: string): string {
    return (text || '').replace(/\s+/g, ' ').trim().slice(0, DEBUG_PREVIEW_LEN)
  }

  clearCache(): void {
    this.lastHash = null
    this.lastText = ''
    this.lastTimestamp = 0
  }

  async terminate(): Promise<void> {
    uninstallStderrFilter()
    if (this.worker) {
      try {
        await this.worker.terminate()
      } catch (err) {
        logger.debug('OCRProcessor: terminate error', err)
      }
      this.worker = null
    }
    this.initPromise = null
    this.clearCache()
  }
}
