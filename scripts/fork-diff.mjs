#!/usr/bin/env node
/**
 * Record how far `src/client/` has drifted from the ui-workspace client
 * sources it forks. Every file that exists upstream is compared byte for byte,
 * and the diff plus the upstream revision lands in `.scratch/std-fork-diffs/`,
 * so AGENTS.md's fork table can be re-verified instead of trusted. Files that
 * only exist in the fork (the plugin's `addon/`) are listed, not diffed.
 *
 * Usage: node scripts/fork-diff.mjs [upstream-client-dir]
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FORK = path.join(ROOT, 'src', 'client')
const UPSTREAM = process.argv[2]
  ?? 'F:\\workdir\\deepseek-harness\\packages\\client\\ui-workspace\\src\\client'
const OUT = path.join(ROOT, '.scratch', 'std-fork-diffs')

/** Every file below `directory`, as paths relative to it. */
function filesBelow(directory) {
  const found = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...filesBelow(absolute).map(inner => path.join(entry.name, inner)))
    else found.push(entry.name)
  }
  return found.sort()
}

/** The upstream revision, when the checkout is a git work tree. */
function upstreamRevision() {
  for (let directory = UPSTREAM; directory !== path.dirname(directory); directory = path.dirname(directory)) {
    if (!fs.existsSync(path.join(directory, '.git'))) continue
    try {
      const sha = execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      const subject = execFileSync('git', ['-C', directory, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
      return `${sha} ${subject}`
    } catch {
      return '(git unavailable)'
    }
  }
  return '(not a git work tree)'
}

if (!fs.existsSync(UPSTREAM)) {
  process.stderr.write(`fork-diff: upstream client directory not found: ${UPSTREAM}\n`)
  process.exit(1)
}
// The directory is a record of ONE run: a stale file from an earlier upstream
// revision would otherwise read as a current finding.
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const upstreamFiles = filesBelow(UPSTREAM)
const forkOnly = filesBelow(FORK).filter(relative => !upstreamFiles.includes(relative))
const identical = []
const divergent = []
const missing = []
const failures = []

/** Content digest, so "identical" is decided by the bytes and not by a tool exit. */
function digest(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

for (const relative of upstreamFiles) {
  const forkPath = path.join(FORK, relative)
  const record = path.join(OUT, `${relative.split(path.sep).join('_')}.diff`)
  if (!fs.existsSync(forkPath)) {
    missing.push(relative)
    fs.writeFileSync(record, `removed from the fork: ${relative}\n`)
    continue
  }
  if (digest(path.join(UPSTREAM, relative)) === digest(forkPath)) {
    fs.writeFileSync(record, '')
    identical.push(relative)
    continue
  }
  let diff
  try {
    diff = execFileSync('git', ['diff', '--no-index', '--unified=2', path.join(UPSTREAM, relative), forkPath], {
      encoding: 'utf8',
    })
  } catch (error) {
    // `git diff --no-index` exits 1 whenever the inputs differ; that diff is
    // the payload. Any other outcome (git missing, unreadable path) must be
    // reported as a failure — never folded into "identical".
    if (error?.status !== 1 || typeof error.stdout !== 'string' || error.stdout.trim() === '') {
      failures.push(`${relative}: git diff --no-index failed (status ${String(error?.status)})`)
      continue
    }
    diff = error.stdout
  }
  fs.writeFileSync(record, diff)
  divergent.push(`${relative} (${diff.split('\n').filter(line => line.startsWith('+') || line.startsWith('-')).length} changed lines)`)
}

process.stdout.write(`fork-diff: upstream ${UPSTREAM}\n`)
process.stdout.write(`fork-diff: upstream revision ${upstreamRevision()}\n`)
process.stdout.write(`fork-diff: ${identical.length} identical, ${divergent.length} divergent, ${missing.length} removed, ${forkOnly.length} fork-only\n`)
for (const line of divergent) process.stdout.write(`  divergent: ${line}\n`)
for (const line of missing) process.stdout.write(`  removed:   ${line}\n`)
for (const line of forkOnly) process.stdout.write(`  fork-only: ${line}\n`)
process.stdout.write(`fork-diff: records written to ${OUT}\n`)
if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`fork-diff: ${failure}\n`)
  process.exit(1)
}
