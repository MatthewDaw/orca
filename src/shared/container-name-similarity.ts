// Words people add around a container name that never name one ("message the tennis container").
const FILLER_WORDS = new Set([
  'the',
  'a',
  'an',
  'in',
  'on',
  'of',
  'container',
  'containers',
  'agent'
])

export function withoutFillerWords(words: readonly string[]): string[] {
  const kept = words.filter((word) => !FILLER_WORDS.has(word))
  return kept.length > 0 ? kept : [...words]
}

// Edit distance counting an adjacent swap as one edit, so "comptuer" is one away from "computer".
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2]![j - 2]! + 1)
      }
      rows[i]![j] = best
    }
  }
  return rows[a.length]![b.length]!
}

// Why the length tiers: short words differ by one letter from unrelated words ("ux" vs "ui").
function allowedTypos(word: string): number {
  return word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0
}

/** Whether a spoken word names one of a container path's words, allowing a typo or two. */
export function wordNamesPathWord(word: string, pathWords: readonly string[]): boolean {
  return pathWords.some(
    (pathWord) => pathWord.includes(word) || editDistance(word, pathWord) <= allowedTypos(pathWord)
  )
}
