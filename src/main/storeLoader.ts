/**
 * Load electron-store via dynamic import() so the main process works when
 * the package is ESM-only (e.g. v10+) and the bundle is CommonJS.
 */
export type StoreClass = import('electron-store').default

let cached: StoreClass | null = null

export async function loadStore(): Promise<StoreClass> {
  if (cached) return cached
  const m = await import('electron-store')
  cached = m.default
  return cached
}
