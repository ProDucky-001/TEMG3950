/**
 * Screen capture renderer. Runs in a hidden window; listens for capture-request,
 * uses desktopCapturer + getUserMedia, draws to canvas at up to 1920x1080 for better OCR, sends PNG to main.
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

/** Crop to top 50% of window: skip tabs (top 4%), capture next 46% (URL bar + page content). */
const URL_BAR_TOP_RATIO = 0.04
const URL_BAR_HEIGHT_RATIO = 0.46
/** Scale up URL bar crop for OCR so characters have more pixels (reduces mai->mail errors). */
const URL_BAR_OCR_SCALE = 3
/** Minimum canvas size for Tesseract: wide enough for full URL, avoids "Image too small to scale". */
const MIN_OCR_WIDTH = 640
const MIN_OCR_HEIGHT = 48

/**
 * Light contrast stretch + grayscale for OCR. Preserves detail; no binarization.
 * Improves readability of grey/white URL bar text.
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
    const topPx = safeCh * URL_BAR_TOP_RATIO
    const barH = Math.max(80, Math.round(safeCh * URL_BAR_HEIGHT_RATIO))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(MIN_OCR_WIDTH, safeCw * URL_BAR_OCR_SCALE)
    canvas.height = Math.max(MIN_OCR_HEIGHT, barH * URL_BAR_OCR_SCALE)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2d context')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      video,
      0, (topPx / safeCh) * h, w, (barH / safeCh) * h,
      0, 0, canvas.width, canvas.height
    )
    enhanceContrastForOCR(ctx, canvas.width, canvas.height)
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
