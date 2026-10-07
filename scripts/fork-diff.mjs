#!/usr/bin/env node
/**
 * Record how far `src/client/` has drifted from the ui-workspace client
 * sources it forks. Every file that exists upstream is compared byte for byte,
 * and the diff plus the upstream revision lands in `.scratch/std-fork-diffs/`,
 * so AGENTS.md's fork table can be re-verified instead of trusted. Files that
 * only exist in the fork (the plugin's `addon/`) are listed, not diffed.
 *
 * Usage: node scripts/fork-diff.mjs [upstream-client-dir] [--allow-moved-anchor] [--allow-missing-seed-file]
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLATFORM_SEEDS } from './platform-seeds.mjs'

/**
 * The upstream commit this fork is anchored to — the revision AGENTS.md's fork
 * table ("22 个文件中 15 个逐字节一致、7 个带插件增量，插件另有 5 个自有文件")
 * describes. The local checkout may have moved past it, which the run reports
 * instead of printing a revision nobody compares: a moved anchor means the
 * table has to be re-derived, so it exits non-zero unless
 * `--allow-moved-anchor` says the new revision is being adopted deliberately.
 */
const ANCHOR_SHA = '5badb15'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FORK = path.join(ROOT, 'src', 'client')
const args = process.argv.slice(2).filter((arg) => arg !== '--allow-moved-anchor')
const allowMovedAnchor = process.argv.includes('--allow-moved-anchor')
const UPSTREAM = args[0]
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

/**
 * The platform's own seed list, read from the upstream checkout.
 *
 * `PLATFORM_MODULES` (`packages/client/web/src/platform.ts`) is the single
 * source of truth the shell seeds, bundles and aliases from. The bundle gate can
 * only see "every require is a seed word" and "every seed word we import is
 * still required": a word upstream ADDS would be inlined the moment this fork
 * imported it, with the gate still green. Comparing the two lists here — where
 * the upstream checkout is already required, and where the anchor check above
 * has pinned the revision — closes that.
 *
 * The path is derived from the upstream client directory, so a checkout laid out
 * differently reports an error instead of quietly skipping the comparison; a run
 * that legitimately has no platform.ts passes `--allow-missing-seed-file`.
 * @returns the seed words and the file they came from, or why they could not be read.
 */
function upstreamSeeds() {
  const file = path.resolve(UPSTREAM, '..', '..', '..', 'web', 'src', 'platform.ts')
  if (!fs.existsSync(file)) return { error: `not found: ${file}` }
  const array = /PLATFORM_MODULES\s*=\s*\[([\s\S]*?)\]/.exec(fs.readFileSync(file, 'utf8'))
  if (array === null) return { error: `no PLATFORM_MODULES array in ${file}` }
  return { file, seeds: new Set([...array[1].matchAll(/'([^']+)'/g)].map(match => match[1])) }
}

/** The upstream revision, when the checkout is a git work tree. */
function upstreamRevision() {
  for (let directory = UPSTREAM; directory !== path.dirname(directory); directory = path.dirname(directory)) {
    if (!fs.existsSync(path.join(directory, '.git'))) continue
    try {
      const sha = execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      const subject = execFileSync('git', ['-C', directory, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
      return { sha, subject }
    } catch {
      return { sha: null, subject: '(git unavailable)' }
    }
  }
  return { sha: null, subject: '(not a git work tree)' }
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

const revision = upstreamRevision()
const anchorMatches = revision.sha !== null && revision.sha.startsWith(ANCHOR_SHA)
const seedCheck = upstreamSeeds()
const allowMissingSeedFile = process.argv.includes('--allow-missing-seed-file')
const seedsMissingHere = seedCheck.seeds === undefined ? [] : [...seedCheck.seeds].filter(seed => !PLATFORM_SEEDS.includes(seed))
const seedsExtraHere = seedCheck.seeds === undefined ? [] : PLATFORM_SEEDS.filter(seed => !seedCheck.seeds.has(seed))
const seedsLine = seedCheck.seeds === undefined
  ? `seeds       NOT COMPARED — ${seedCheck.error}`
  : `seeds       ${seedCheck.seeds.size} upstream / ${PLATFORM_SEEDS.length} here — ${seedsMissingHere.length === 0 && seedsExtraHere.length === 0 ? 'equal' : 'DIFFERENT'}`
const summary = [
  `anchor      ${ANCHOR_SHA}`,
  `upstream    ${revision.sha ?? '(unknown)'} ${revision.subject}`,
  `anchor match ${anchorMatches ? 'yes' : 'NO — re-derive AGENTS.md\'s fork table'}`,
  `files       ${identical.length} identical, ${divergent.length} divergent, ${missing.length} removed, ${forkOnly.length} fork-only`,
  seedsLine,
  '',
]
fs.writeFileSync(path.join(OUT, '_summary.txt'), summary.join('\n'))

process.stdout.write(`fork-diff: upstream ${UPSTREAM}\n`)
process.stdout.write(`fork-diff: upstream revision ${revision.sha ?? '(unknown)'} ${revision.subject}\n`)
process.stdout.write(`fork-diff: anchored at ${ANCHOR_SHA} — ${anchorMatches ? 'the checkout is on the anchor' : 'THE CHECKOUT HAS MOVED'}\n`)
process.stdout.write(`fork-diff: ${identical.length} identical, ${divergent.length} divergent, ${missing.length} removed, ${forkOnly.length} fork-only\n`)
process.stdout.write(`fork-diff: ${seedsLine.trim()}\n`)
for (const line of divergent) process.stdout.write(`  divergent: ${line}\n`)
for (const line of missing) process.stdout.write(`  removed:   ${line}\n`)
for (const line of forkOnly) process.stdout.write(`  fork-only: ${line}\n`)
process.stdout.write(`fork-diff: records written to ${OUT}\n`)
if (seedCheck.seeds === undefined) {
  if (allowMissingSeedFile) {
    process.stdout.write(`fork-diff: seed comparison skipped on request (${seedCheck.error})\n`)
  } else {
    process.stderr.write(`fork-diff: the platform seed list could not be read (${seedCheck.error});`
      + ' pass --allow-missing-seed-file to skip the comparison deliberately\n')
    failures.push('the platform seed list could not be compared')
  }
}
if (seedsMissingHere.length > 0) {
  process.stderr.write(`fork-diff: upstream seeds missing from scripts/platform-seeds.mjs: ${seedsMissingHere.join(', ')}\n`)
  failures.push('the platform seed list moved ahead of scripts/platform-seeds.mjs')
}
if (seedsExtraHere.length > 0) {
  process.stderr.write(`fork-diff: scripts/platform-seeds.mjs lists seeds the platform does not: ${seedsExtraHere.join(', ')}\n`)
  failures.push('scripts/platform-seeds.mjs lists a module the platform does not seed')
}
if (revision.sha !== null && !anchorMatches && !allowMovedAnchor) {
  process.stderr.write(
    `fork-diff: upstream is at ${revision.sha.slice(0, 7)}, not the anchored ${ANCHOR_SHA}:`
    + ' the sync table in AGENTS.md describes the anchored revision, so re-derive it and'
    + ' pass --allow-moved-anchor once the new anchor is recorded\n',
  )
  failures.push('upstream revision moved past the anchor')
}
if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`fork-diff: ${failure}\n`)
  process.exit(1)
}
