/**
 * Text normalization: run once per email, reuse everywhere.
 */

export interface NormalizedEmail {
  original: string;
  lowercase: string;
  length: number;
}

/**
 * Normalize email text once. Truncate very large input to avoid regex cost on huge strings.
 */
const MAX_TEXT_FOR_PATTERNS = 100_000;

export function normalizeEmail(text: string): NormalizedEmail {
  const original = (text || '').trim();
  const toProcess = original.length > MAX_TEXT_FOR_PATTERNS
    ? original.slice(0, MAX_TEXT_FOR_PATTERNS)
    : original;
  const lowercase = toProcess.toLowerCase();
  return {
    original: toProcess,
    lowercase,
    length: original.length,
  };
}
