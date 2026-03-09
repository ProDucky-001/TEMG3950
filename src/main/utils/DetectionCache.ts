interface CacheEntry<T> {
  data: T
  timestamp: number
  key: string
}

/**
 * Cache for detection results to avoid redundant processing. TTL-based eviction.
 */
export class DetectionCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private readonly ttlMs: number

  constructor(ttlMs: number = 30_000) {
    this.ttlMs = ttlMs
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined
    if (!entry) return null
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key)
      return null
    }
    return entry.data as T
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      key,
    })
  }

  /** Generate cache key from window identity (name + bounds). */
  static windowKey(ownerName: string, bounds: { x: number; y: number; width: number; height: number }): string {
    return `${ownerName}|${bounds.x},${bounds.y},${bounds.width}x${bounds.height}`
  }

  clear(): void {
    this.cache.clear()
  }
}
