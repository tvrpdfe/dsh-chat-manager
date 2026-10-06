/**
 * Path normalization shared by the host half and the client bundle. Both
 * halves fold separators, trailing slashes, and case the same way so a
 * session cwd and a chat root compare equal across processes.
 */

/** Fold separators and trailing slashes (case preserved). */
export function normalizePath(p: string | undefined | null): string {
  return String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Case-insensitive normalization (Windows semantics on every platform). */
export function normalizePathLower(p: string | undefined | null): string {
  return normalizePath(p).toLowerCase()
}

/** True when `cwd` equals `root` or lies beneath it (case-insensitive, both separators). */
export function isUnderChatRoot(cwd: string | undefined, root: string | null): boolean {
  if (!cwd || !root) return false
  const a = normalizePathLower(cwd)
  const b = normalizePathLower(root)
  return a === b || a.startsWith(b + '/')
}

/** Case-insensitive normalized path equality (both separators). */
export function samePath(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  return normalizePathLower(a) === normalizePathLower(b)
}
