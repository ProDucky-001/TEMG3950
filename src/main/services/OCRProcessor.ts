import { createWorker } from 'tesseract.js'
import { logger } from './logger'

const OCR_CACHE_MS = 2000
const MAX_CONCURRENT = 1
/** PSM 7 = single line (URL bar). PSM 6 = uniform block (fallback). */
const TESSERACT_PSM_LINE = '7'
const TESSERACT_PSM_BLOCK = '6'
/** Retry with block mode if line mode confidence is below this (0-100). */
const LOW_CONFIDENCE_THRESHOLD = 55
/** Skip OCR when image is too small (Tesseract errors "Image too small to scale"). ~640x48 PNG is several KB. */
const MIN_IMAGE_BYTES = 5000
/** Minimum PNG dimensions (from IHDR) to pass to Tesseract; avoids "1x36" style errors. */
const MIN_PNG_WIDTH = 100
const MIN_PNG_HEIGHT = 30

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Tesseract/Leptonica C++ can write internal errors to stderr; filter those lines so the terminal stays clean. */
let stderrFilterRefCount = 0
const TESSERACT_STDERR_BLACKLIST = /Image too small|Line cannot be recognized|Error in pix|Scaling pix of size|Bad pix from ImageData/
function installStderrFilter(): void {
  if (stderrFilterRefCount++ > 0) return
  const orig = process.stderr.write.bind(process.stderr)
  ;(process.stderr as unknown as { _tesseractOrigWrite?: typeof process.stderr.write })._tesseractOrigWrite = orig
  process.stderr.write = function (this: NodeJS.WriteStream, ...args: Parameters<typeof process.stderr.write>): boolean {
    const chunk = args[0]
    const s = typeof chunk === 'string' ? chunk : (Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk))
    if (TESSERACT_STDERR_BLACKLIST.test(s)) {
      const cb = args.length >= 1 && typeof args[args.length - 1] === 'function' ? args[args.length - 1] as (err?: Error) => void : undefined
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
  const orig = (process.stderr as unknown as { _tesseractOrigWrite?: typeof process.stderr.write })._tesseractOrigWrite
  if (orig) {
    process.stderr.write = orig
    delete (process.stderr as unknown as { _tesseractOrigWrite?: typeof process.stderr.write })._tesseractOrigWrite
  }
}

/** Read PNG width and height from IHDR (big-endian at offset 16 and 20). Returns null if not a valid PNG or too small. */
function getPngDimensions(buf: Buffer | Uint8Array | ArrayBuffer): { width: number; height: number } | null {
  if (!buf || buf.length < 24) return null
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer | SharedArrayBuffer)
  if (b.compare(PNG_SIGNATURE, 0, 8, 0, 8) !== 0) return null
  const width = b.readUInt32BE(16)
  const height = b.readUInt32BE(20)
  return { width, height }
}

/** Fix common OCR misreads in URL bar text (grey/white, thin fonts). Normalize whitespace. */
function postProcessOCRText(text: string): string {
  if (!text || text.length < 2) return text
  let t = text
  const fixes: [RegExp, string][] = [
    [/\bmai\.google\b/gi, 'mail.google'],
    [/\bmai1\.google\b/gi, 'mail.google'],
    [/\boutlok\b/gi, 'outlook'],
    [/\bout\s*look\b/gi, 'outlook'],
    [/\boutlook\.live\b/gi, 'outlook.live'],
    [/\boutlook\.office\b/gi, 'outlook.office'],
    [/\boutlook\.off1ce\b/gi, 'outlook.office'],
    [/\boutlook\.cloud\b/gi, 'outlook.cloud'],
    [/\brnicrosoft\b/gi, 'microsoft'],
    [/\bmircrosoft\b/gi, 'microsoft'],
    [/\boff1ce\.com\b/gi, 'office.com'],
    [/\bgrnail\b/gi, 'gmail'],
    [/\bgrnait\b/gi, 'gmail'],
    [/\bgoogte\.com\b/gi, 'google.com'],
    [/\bgoog1e\.com\b/gi, 'google.com'],
    [/\binbox\s*\/\s*mail/gi, 'inbox/mail'],
  ]
  for (const [re, replacement] of fixes) {
    t = t.replace(re, replacement)
  }
  t = t.replace(/\s+/g, ' ').replace(/\s*[\r\n]+\s*/g, ' ').trim()
  return t
}

/**
 * Runs OCR locally using Tesseract.js. All processing is in-process; no cloud APIs.
 * For high accuracy (target >99% on URL bar and email UI text): use preprocessForOCR
 * before recognize (grayscale, normalize, optional scale), use appropriate PSM (7 for
 * single line, 6 for block), and postProcessOCRText for common misreads.
 * Caches results for 2 seconds to avoid redundant processing of the same frame.
 */
export class OCRProcessor {
  private worker: Awaited<ReturnType<typeof createWorker>> | null = null
  private initPromise: Promise<void> | null = null
  private lastHash: string | null = null
  private lastText: string = ''
  private lastTimestamp = 0
  private busy = false

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
        const w = await createWorker('eng', 1, {
          logger: () => {},
        })
        installStderrFilter()
        this.worker = w
      } catch (err) {
        logger.error('OCRProcessor: failed to create worker', err)
        this.initPromise = null
        throw err
      }
    })()
    await this.initPromise
    this.initPromise = null
    return this.worker!
  }

  /**
   * Extract text from image buffer. Uses 2s cache to avoid re-OCR of same content.
   * Optimized for email-style content (subject, sender, body, links).
   */
  async recognize(imageBuffer: Buffer | Uint8Array | ArrayBuffer): Promise<string> {
    if (!imageBuffer || imageBuffer.length < MIN_IMAGE_BYTES) {
      return ''
    }
    const buf = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer as ArrayBuffer | SharedArrayBuffer)
    const dims = getPngDimensions(buf)
    if (dims && (dims.width < MIN_PNG_WIDTH || dims.height < MIN_PNG_HEIGHT)) {
      return ''
    }
    const hash = OCRProcessor.hashBuffer(buf)
    const now = Date.now()
    if (hash === this.lastHash && now - this.lastTimestamp < OCR_CACHE_MS) {
      return this.lastText
    }

    if (this.busy) {
      return this.lastText || ''
    }
    this.busy = true
    try {
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
          confidence = block.confidence
        }
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

  /** Clear cache (e.g. when switching context). */
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
