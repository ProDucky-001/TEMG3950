/**
 * Only consider as link a real URL (http/https), not bookmark labels or menu text.
 */
export function isRealUrl(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false
  const t = s.trim()
  return /^https?:\/\/[^\s]+/.test(t) && t.length < 2000
}

/**
 * Strict URL validation (parsable, http(s), reasonable length). For accuracy optimization.
 */
export function isValidURL(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') return false
  const t = text.trim()
  if (t.length < 10 || t.length > 2000) return false
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : 'https://' + t)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
