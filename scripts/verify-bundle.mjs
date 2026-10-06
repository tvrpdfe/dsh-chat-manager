#!/usr/bin/env node
/**
 * Post-build gate for the browser half. The platform serves the bytes of
 * `lib/client.js` into the client module table, which resolves ONLY the seed
 * words listed below, so a require outside that set fails at load. The
 * remaining assertions guard regressions this fork has already hit: retired
 * 0.1.x platform names, and CSS Modules hash class names that no selector can
 * carry.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** The browser bundle: the gate's subject. */
const CLIENT_BUNDLE = 'lib/client.js'
/** Both bundles `scripts/build.mjs` writes; neither may lag its inputs. */
const ARTIFACTS = [CLIENT_BUNDLE, 'lib/index.js']

/** Seed words of the platform client module table (dsh-client-modules). */
const PLATFORM_SEEDS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

/** Platform names that only ever existed before the 0.2.x rename. */
const RETIRED = [
  { pattern: /Icon[A-Za-z]+Outline(?:14|16|20)/g, hint: '0.2.x icons are <Base>Regular / <Base>Medium' },
  { pattern: /IconFolder(?:Close|Open)(?:16|Outline)/g, hint: '0.2.x folder icons carry no size suffix' },
  { pattern: /useSessionPendingInteraction/g, hint: '0.2.x replaced it with useSessionStatus' },
  { pattern: /sessions\.open\(/g, hint: '0.2.x opens a Session through uiWorkspace.openSession' },
]

const failures = []
const source = readFileSync(path.join(ROOT, CLIENT_BUNDLE), 'utf8')

// 0. This gate certifies ARTIFACTS, so an artifact older than the inputs it is
//    built from certifies code that is not in it. `npm run verify` rebuilds
//    before it calls the gate, but the gate is also run on its own — and on its
//    own it used to pass on a stale bundle: a source-only edit (this round's own
//    copy change) left the served bytes untouched while the gate said ok.
const inputs = []
const collect = (dir) => {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) collect(path.join(dir, entry.name))
    else if (/\.(?:ts|tsx|css)$/.test(entry.name)) inputs.push(path.join(dir, entry.name))
  }
}
collect('src')
// `tsconfig.json` is not read by build.mjs directly, but esbuild discovers it.
inputs.push('scripts/build.mjs', 'tsconfig.json', 'package.json')
const oldestArtifact = Math.min(...ARTIFACTS.map(rel => statSync(path.join(ROOT, rel)).mtimeMs))
const stale = inputs
  .map(rel => ({ rel, mtimeMs: statSync(path.join(ROOT, rel)).mtimeMs }))
  .filter(input => input.mtimeMs > oldestArtifact)
if (stale.length > 0) {
  const names = stale.map(input => input.rel.replace(/\\/g, '/')).slice(0, 3).join(', ')
  failures.push(`stale build: ${names}${stale.length > 3 ? ` (+${stale.length - 3} more)` : ''} newer than ${ARTIFACTS.join(' / ')} — run npm run build`)
}

// 1. Every module-table request stays inside the seed words.
const requires = new Set([...source.matchAll(/require\(["']([^"']+)["']\)/g)].map(match => match[1]))
for (const specifier of requires) {
  if (!PLATFORM_SEEDS.has(specifier)) {
    failures.push(`lib/client.js requires the non-seed module "${specifier}"`)
  }
}

// 2. Retired platform names never come back.
for (const { pattern, hint } of RETIRED) {
  const hits = source.match(pattern) ?? []
  if (hits.length > 0) {
    failures.push(`lib/client.js uses the retired name ${hits[0]} (${hits.length}x) — ${hint}`)
  }
}

// 3. CSS Modules hash class names start with the letter 'm': CSSOM drops a
//    selector whose first character is a digit, which would take the whole
//    sheet with it (no styling at all). esbuild keeps the injected sheet next
//    to its map (`var cssTextN = "..."` / `var classMapN = {...}`), so both
//    halves are read from the bundle and every N is covered — finding none is a
//    vacuous pass, not a green gate.
// 3b. A renamed class must appear hashed in its own sheet, and no unhashed
//    `.local` may survive there. Partial renames are silent: the element gets
//    the hashed class while the compound selector keeps the plain name, so the
//    whole rule dies. This is not hypothetical — renaming only the first class
//    of `.row.menuOpen` killed every `.menuOpen` rule, which dropped the session
//    row's verb strip to `display: none` under the pointer and teleported the
//    portaled session menu to the viewport corner (unreachable by mouse).
//    Both assertions read SELECTORS only: a comment (`Rows.tsx`) or a string
//    value (`content: '.rail'`) naming a class is prose or data, and judging it
//    would hand out false passes (a comment satisfying the selector check) and
//    false failures alike. This is a deliberately independent re-implementation
//    of what the build's transform must have done — sharing its code would let
//    one bug satisfy both sides.
const sheets = [...source.matchAll(/var cssText(\d*) = ("(?:[^"\\]|\\.)*");\s*var classMap(\d*) = (\{[^}]*\})/g)]
const classMaps = [...source.matchAll(/var classMap\d* = (\{[^}]*\})/g)]
if (classMaps.length === 0) {
  failures.push('no CSS class map found in lib/client.js: the m-prefix assertion would pass vacuously')
}
if (sheets.length !== classMaps.length) {
  failures.push(`paired ${sheets.length} CSS sheet(s) with ${classMaps.length} class map(s) in lib/client.js`)
}
let checkedClasses = 0
for (const sheet of sheets) {
  const css = JSON.parse(sheet[2])
  const selectors = css
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g, ' ')
  for (const [local, hashed] of Object.entries(JSON.parse(sheet[4]))) {
    checkedClasses += 1
    if (!/^m[0-9a-f]{6}_/.test(hashed)) {
      failures.push(`CSS class ${local} -> ${hashed} lacks the m-prefixed hash`)
    }
    if (!selectors.includes(`.${hashed}`)) {
      failures.push(`CSS class ${local} -> ${hashed} appears in no selector of its sheet: every rule using it is dead`)
    }
    const bare = new RegExp(`\\.${local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-])`)
    if (bare.test(selectors)) {
      failures.push(`CSS class ${local} survives unhashed in a selector: a compound like .row.${local} keeps only its first class`)
    }
  }
}

if (classMaps.length > 0 && checkedClasses === 0) {
  failures.push('the CSS class maps carry no entries: the m-prefix assertion would pass vacuously')
}

// 4. The bundle registers the id the platform expects. The client module table
//    stamps and then asserts the package name (tsdown.client.ts stamps
//    `id: <package name>`; the loader rejects a bundle that registers
//    anything else), so the id is the manifest name — never the patch row id.
const id = /__ModuleLoader__\.load\(\{\s*id:\s*["']([^"']+)["']/.exec(source)?.[1]
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const patch = readFileSync(path.join(ROOT, 'cordis.patch.yml'), 'utf8')
if (id === undefined) {
  failures.push('lib/client.js does not register through window.__ModuleLoader__.load')
} else {
  if (id !== manifest.name) {
    failures.push(`bundle id "${id}" is not the package name "${String(manifest.name)}"`)
  }
  if (!patch.includes(`name: ${id}`)) {
    failures.push(`cordis.patch.yml does not mount the "${id}" package`)
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`verify-bundle: ${failure}\n`)
  process.exit(1)
}
process.stdout.write(
  `verify-bundle: ok (${requires.size} seed requires, ${classMaps.length} CSS sheets / ${checkedClasses} classes, ${source.length} bytes)\n`,
)
