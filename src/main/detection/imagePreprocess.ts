/**
 * Image preprocessing for better OCR accuracy: grayscale, contrast, crop.
 * Uses sharp for decode/process/encode in the main process.
 */

import sharp from 'sharp'

const OCR_SCALE = 300 / 96

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Remove non-ASCII and normalize whitespace to fix garbled OCR (e.g. Firefox).
 */
export function cleanOCRText(text: string): string {
  if (!text || typeof text !== 'string') return ''
  return text
    .replace(/[^\x00-\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Preprocess image for OCR: grayscale, increase contrast, optional resize.
 * Returns PNG buffer.
 */
export async function preprocessForOCR(imageBuffer: Buffer): Promise<Buffer> {
  if (!imageBuffer || imageBuffer.length < 100) return imageBuffer
  try {
    const meta = await sharp(imageBuffer).metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0

    let pipeline = sharp(imageBuffer).grayscale()

    const { data } = await sharp(imageBuffer)
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true })

    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i]
    const meanBrightness = sum / data.length
    const isDark = meanBrightness < 96

    if (isDark) {
      pipeline = pipeline.negate({ alpha: false })
    }
    pipeline = pipeline.normalize()

    if (w > 0 && h > 0 && (w < 800 || h < 600)) {
      const scale = Math.min(OCR_SCALE, 1920 / w, 1080 / h)
      if (scale > 1) {
        pipeline = pipeline.resize(Math.round(w * scale), Math.round(h * scale), { kernel: 'lanczos3' })
      }
    }
    return pipeline.png({ compressionLevel: 6 }).toBuffer()
  } catch {
    return imageBuffer
  }
}

/** Toolbar skip (top) and status bar exclude (bottom) for Firefox content region. */
const FIREFOX_TOOLBAR_HEIGHT = 60
const FIREFOX_BOTTOM_EXCLUDE = 120

/**
 * Preprocess for Firefox: crop to content area (skip toolbar, exclude bottom) then grayscale/normalize with higher contrast.
 */
export async function preprocessForOCRFirefox(imageBuffer: Buffer): Promise<Buffer> {
  if (!imageBuffer || imageBuffer.length < 100) return imageBuffer
  try {
    const meta = await sharp(imageBuffer).metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    if (w < 100 || h < 200) return imageBuffer
    const top = Math.min(FIREFOX_TOOLBAR_HEIGHT, Math.floor(h * 0.08))
    const bottomExclude = Math.min(FIREFOX_BOTTOM_EXCLUDE, Math.floor(h * 0.12))
    const contentHeight = h - top - bottomExclude
    if (contentHeight < 100) return imageBuffer
    const cropped = await sharp(imageBuffer)
      .extract({ left: 0, top, width: w, height: contentHeight })
      .grayscale()
      .normalize()
      .linear(1.25, -(128 * 0.25))
      .png({ compressionLevel: 6 })
      .toBuffer()
    return cropped
  } catch {
    return imageBuffer
  }
}

/**
 * Crop image to the given region. Useful for targeting email content area.
 */
export async function extractTextRegion(
  imageBuffer: Buffer,
  bounds: Bounds
): Promise<Buffer> {
  if (!imageBuffer || imageBuffer.length < 100) return imageBuffer
  const { x, y, width, height } = bounds
  if (width < 10 || height < 10) return imageBuffer
  try {
    return sharp(imageBuffer)
      .extract({
        left: Math.max(0, Math.round(x)),
        top: Math.max(0, Math.round(y)),
        width: Math.round(width),
        height: Math.round(height),
      })
      .png({ compressionLevel: 6 })
      .toBuffer()
  } catch {
    return imageBuffer
  }
}
