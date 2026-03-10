import type { WindowBounds } from '../../shared/background-types'

/**
 * Minimal window descriptor for tiered detection (pattern match, cache key, priority).
 */
export interface WindowInfo {
  owner: { name: string }
  bounds: WindowBounds
  /** Resolved app type: chrome, safari, outlook, gmail, generic, etc. */
  appType: string
  /** Current browser URL if available (from platform), no OCR. */
  browserUrl?: string | null
}

export interface Tier1Result {
  isEmail: boolean
  appType: string
  detectionTime: number
  confidence: number
}

export interface Tier2Result {
  url: string | null
  confidence: number
  detectionTime: number
}

export interface Tier3Result {
  fullText: string
  urls: string[]
  threatDetected: boolean
  riskScore: number
  reasons: string[]
  detectionTime: number
}
