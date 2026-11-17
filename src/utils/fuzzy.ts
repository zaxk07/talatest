const ARTICLES = /^(the|a|an)\s+/

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(ARTICLES, '')
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]
}

/**
 * Tolerant answer check. Strict mode = exact after normalisation.
 * Lenient mode allows ~20% edit distance (max 3), minimum word length 4.
 */
export function isCloseEnough(input: string, expected: string, strict: boolean): boolean {
  const a = normalize(input)
  const b = normalize(expected)
  if (!a || !b) return false
  if (a === b) return true
  if (strict) return false
  if (b.length < 4) return false
  const allowed = Math.min(3, Math.max(1, Math.floor(b.length * 0.2)))
  return levenshtein(a, b) <= allowed
}
