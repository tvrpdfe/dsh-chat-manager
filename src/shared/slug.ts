/**
 * Chat-folder slug generation: 2–4 lowercase hyphenated English words.
 * The host half is the only consumer, but the rules stay in a module of
 * their own so the spec contract ("2–4 个英文小写单词，连字符分隔") is
 * documented next to its enforcement and both generator paths (LLM and
 * local fallback) share one finalizer.
 */

/** Split raw text into lowercase alphanumeric words. */
export function slugWords(raw: string | undefined | null): string[] {
  return String(raw ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0)
}

/**
 * Deterministic 2–4 word slug: cap to `maxWords` (default 4), pad short
 * sources to `minWords` (default 2) with the stable filler `session`, and
 * join with hyphens. A source with no words at all starts from `chat`
 * before padding, so the result is never empty and never a single word.
 */
export function cleanSlug(raw: string | undefined | null, minWords = 2, maxWords = 4): string {
  let words = slugWords(raw).slice(0, maxWords)
  if (words.length === 0) words = ['chat']
  while (words.length < minWords) words.push('session')
  return words.join('-')
}

/**
 * Candidate for `words` after `n` collisions (n = 0 keeps the slug verbatim).
 * Later attempts trim one trailing word and append the counter `-${n + 1}`,
 * so the first collision is `-2` (the historical suffix) and every candidate
 * stays inside the same 2–4 word range the slug contract promises
 * (`'a-b-c-d'` collides → `'a-b-c-2'`).
 */
export function collisionSlug(words: readonly string[], n: number): string {
  if (n <= 0) return words.join('-')
  const trimmed = words.slice(0, Math.max(words.length - 1, 1))
  return `${trimmed.join('-')}-${n + 1}`
}
