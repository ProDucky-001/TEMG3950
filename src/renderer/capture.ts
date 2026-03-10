/**
 * Screen capture renderer. Runs in a hidden window; listens for capture-request,
 * uses desktopCapturer + getUserMedia. Captures two regions for OCR:
 * 1) URL bar only (top narrow strip)
 * 2) Email body region (mid-right: 40–90% width, 30–80% height)
 * Composites into one image (URL bar on top) so OCR reads URLs first, then email content.
 */
const MAX_WIDTH = 1920
const MAX_HEIGHT = 1080

declare global {
  interface Window {
    captureAPI: {
      getSources: (opts: { types: ('window' | 'screen')[] }) => Promise<Array<{ id: string; name: string }>>
      sendResult: (buffer: ArrayBuffer, error?: string) => void
      onCaptureRequest: (callback: (preferWindowId?: string) => void) => () => void
    }
  }
}

/** URL bar only: skip tabs (top 4%), next 11% = address bar. */
const URL_BAR_TOP_RATIO = 0.04
const URL_BAR_HEIGHT_RATIO = 0.11
/** Email region: mid-right where body usually is — 40%–90% width, 30%–80% height. */
const EMAIL_REGION_X_RATIO = 0.4
const EMAIL_REGION_WIDTH_RATIO = 0.5
const EMAIL_REGION_Y_RATIO = 0.3
const EMAIL_REGION_HEIGHT_RATIO = 0.5
/** Scale crops for OCR (more pixels = better recognition). */
const OCR_SCALE = 2
const MIN_OCR_WIDTH = 640
const MIN_OCR_HEIGHT = 48

/**
 * Light contrast stretch + grayscale for OCR.
 */
function enhanceContrastForOCR(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  let min = 255
  let max = 0
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    min = Math.min(min, g)
    max = Math.max(max, g)
  }
  const span = Math.max(1, max - min)
  for (let i = 0; i < data.length; i += 4) {
    const g = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] - min) / span * 255
    const v = Math.max(0, Math.min(255, Math.round(g)))
    data[i] = data[i + 1] = data[i + 2] = v
  }
  ctx.putImageData(imageData, 0, 0)
}

function scaleDimensions(width: number, height: number): { w: number; h: number } {
  if (width <= MAX_WIDTH && height <= MAX_HEIGHT) return { w: width, h: height }
  const r = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height)
  return { w: Math.round(width * r), h: Math.round(height * r) }
}

async function captureSource(sourceId: string): Promise<ArrayBuffer> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSourceId: sourceId,
        chromeMediaSource: 'desktop',
      },
    } as MediaTrackConstraints,
  })
  try {
    const video = document.createElement('video')
    video.srcObject = stream
    video.autoplay = true
    video.muted = true
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Video load failed'))
    })
    await video.play()
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) throw new Error('Invalid video dimensions')
    const { w: cw, h: ch } = scaleDimensions(w, h)
    const safeCw = Math.max(1, cw)
    const safeCh = Math.max(1, ch)

    // Region 1: URL bar only (top strip)
    const urlBarTopPx = safeCh * URL_BAR_TOP_RATIO
    const urlBarH = Math.max(40, Math.round(safeCh * URL_BAR_HEIGHT_RATIO))
    const urlBarCw = Math.max(MIN_OCR_WIDTH, safeCw * OCR_SCALE)
    const urlBarCh = Math.max(MIN_OCR_HEIGHT, urlBarH * OCR_SCALE)

    // Region 2: Email body (mid-right: 40%–90% width, 30%–80% height)
    const emailX = Math.round(safeCw * EMAIL_REGION_X_RATIO)
    const emailW = Math.round(safeCw * EMAIL_REGION_WIDTH_RATIO)
    const emailY = Math.round(safeCh * EMAIL_REGION_Y_RATIO)
    const emailH = Math.round(safeCh * EMAIL_REGION_HEIGHT_RATIO)
    const emailCw = Math.max(320, emailW * OCR_SCALE)
    const emailCh = Math.max(200, emailH * OCR_SCALE)

    const totalH = urlBarCh + emailCh
    const totalW = Math.max(urlBarCw, emailCw)
    const canvas = document.createElement('canvas')
    canvas.width = totalW
    canvas.height = totalH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2d context')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Draw URL bar crop at top (source: full width, url bar strip)
    ctx.drawImage(
      video,
      0, (urlBarTopPx / safeCh) * h, w, (urlBarH / safeCh) * h,
      0, 0, urlBarCw, urlBarCh
    )

    // Draw email region below (source: 40–90% width, 30–80% height)
    ctx.drawImage(
      video,
      (emailX / safeCw) * w, (emailY / safeCh) * h, (emailW / safeCw) * w, (emailH / safeCh) * h,
      0, urlBarCh, emailCw, emailCh
    )
    enhanceContrastForOCR(ctx, totalW, totalH)

    stream.getTracks().forEach((t) => t.stop())
    return new Promise<ArrayBuffer>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('toBlob failed'))
            return
          }
          blob.arrayBuffer().then(resolve).catch(reject)
        },
        'image/png',
        0.92
      )
    })
  } finally {
    stream.getTracks().forEach((t) => t.stop())
  }
}

function run() {
  if (!window.captureAPI) {
    console.error('captureAPI not available')
    return
  }
  window.captureAPI.onCaptureRequest(async (preferWindowId) => {
    try {
      const api = window.captureAPI
      if (!api?.sendResult) {
        return
      }
      if (!api.getSources) {
        api.sendResult(new ArrayBuffer(0), 'Capture preload not loaded (getSources unavailable)')
        return
      }
      const sources = await api.getSources({ types: ['window', 'screen'] })
      const windowSources = sources.filter((s) => s.name && s.name !== 'Entire Screen' && s.name !== 'Screen 1' && s.name !== 'Screen 2')
      let chosen = windowSources.find((s) => s.id === preferWindowId)
      if (!chosen && windowSources.length > 0) {
        chosen = windowSources[0]
      }
      if (!chosen) {
        chosen = sources[0]
      }
      if (!chosen) {
        api.sendResult(new ArrayBuffer(0), 'No capture source available')
        return
      }
      const buffer = await captureSource(chosen.id)
      api.sendResult(buffer)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.captureAPI?.sendResult(new ArrayBuffer(0), message)
    }
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run)
} else {
  run()
}
