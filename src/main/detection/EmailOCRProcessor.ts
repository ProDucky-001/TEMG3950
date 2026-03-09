/**
 * OCR for detection layer: process images and extract structured email content from text.
 * Uses the shared OCRProcessor for Tesseract; adds extractEmailContent for sender, subject, body, links.
 */

import { OCRProcessor } from '../services/OCRProcessor'
import { preprocessForOCR } from './imagePreprocess'

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g

export interface EmailContent {
  sender: string | null
  subject: string | null
  body: string
  links: string[]
}

export class EmailOCRProcessor {
  private worker: OCRProcessor | null = null
  private isInitialized = false

  /**
   * Initialize the OCR worker (lazy on first processImage).
   */
  async initialize(): Promise<void> {
    if (this.isInitialized && this.worker) return
    this.worker = new OCRProcessor()
    this.isInitialized = true
  }

  /**
   * Preprocess image and run OCR. Returns raw text.
   */
  async processImage(imageBuffer: Buffer): Promise<string> {
    await this.initialize()
    if (!this.worker) return ''
    const preprocessed = await preprocessForOCR(imageBuffer)
    return this.worker.recognize(preprocessed)
  }

  /**
   * Parse OCR text to identify email components: sender, subject, body, links.
   */
  extractEmailContent(text: string): EmailContent {
    if (!text || typeof text !== 'string') {
      return { sender: null, subject: null, body: '', links: [] }
    }
    const t = text.trim()
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    let sender: string | null = null
    let subject: string | null = null
    const bodyLines: string[] = []
    const links = [...new Set((t.match(URL_REGEX) ?? []).map((u) => u.replace(/[.,;:!?)]+$/, '')))]

    const fromMatch = t.match(/\b(?:from|sender|发件人|寄件人)\s*[:\s]+\s*([^\n]+)/i)
    if (fromMatch) {
      const email = fromMatch[1].match(EMAIL_REGEX)?.[0]
      if (email) sender = email
      else sender = fromMatch[1].trim().slice(0, 120)
    }
    if (!sender && lines.length > 0) {
      const first = lines[0]
      const emailInFirst = first.match(EMAIL_REGEX)?.[0]
      if (emailInFirst) sender = emailInFirst
    }

    const subjMatch = t.match(/\b(?:subject|re|re:)\s*[:\s]+\s*([^\n]+)/i)
    if (subjMatch) subject = subjMatch[1].trim().slice(0, 200)

    let bodyStart = 0
    if (fromMatch) bodyStart = Math.max(bodyStart, t.indexOf(fromMatch[0]) + fromMatch[0].length)
    if (subjMatch) bodyStart = Math.max(bodyStart, t.indexOf(subjMatch[0]) + subjMatch[0].length)
    const bodySection = t.slice(bodyStart).trim()
    if (bodySection.length > 0) {
      const firstLine = bodySection.split(/\n/)[0]?.trim() ?? ''
      if (!firstLine.match(EMAIL_REGEX) && !firstLine.match(/^(from|subject|to)\s*:/i)) {
        bodyLines.push(bodySection.slice(0, 2000))
      } else {
        const afterHeaders = bodySection.replace(/^(?:from|to|subject|date)\s*[:\s][^\n]+\n?/gim, '').trim()
        bodyLines.push(afterHeaders.slice(0, 2000))
      }
    }
    const body = bodyLines.join('\n').trim() || t.slice(0, 2000).trim()

    return {
      sender,
      subject,
      body,
      links,
    }
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
    }
    this.isInitialized = false
  }
}
