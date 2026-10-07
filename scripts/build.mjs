/**
 * dsh-chat-manager build: TypeScript sources → the two artifacts the profile
 * loader serves.
 *
 *  - lib/index.js  — host half (ESM, Node); the profile imports it as the
 *                    loader row's plugin object.
 *  - lib/client.js — browser bundle in the platform factory shape:
 *                    `window.__ModuleLoader__.load({ id, factory })`. Module
 *                    table requests stay inside the platform seed words, so
 *                    the factory only `require`s seed words (react, cordis,
 *                    dsh-client-store, dsh-client-ui-primitives,
 *                    dsh-client-ui-slots); everything else is bundled.
 *
 * CSS Modules are transformed by a tiny plugin: `.module.css` becomes a JS
 * module exporting the hashed class map, and the sheet is injected into the
 * page (with the platform `data-plugin` attributes) at factory execution —
 * the client-modules claimStyles bookkeeping protocol.
 */
import { build } from 'esbuild'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLATFORM_SEEDS } from './platform-seeds.mjs'

const SCRIPT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)))
const PKG = path.resolve(SCRIPT_DIR, '..')
const SRC = path.join(PKG, 'src')
const LIB = path.join(PKG, 'lib')

/**
 * Rewrite one CSS Module sheet: every class selector becomes `${hash}_${local}`
 * and the build-time scoping wrappers disappear.
 *
 * The rename covers EVERY class in a selector, not just the first: a rule that
 * only renamed a class at the start of a selector (i.e. one preceded by
 * anything but a word character) left `.row.menuOpen` half-translated — the
 * element carried the hashed `menuOpen` while the sheet still said `.menuOpen`,
 * so all five `.menuOpen` rules were dead. The visible damage was the session
 * row's verb strip: it fell back to `display: none` as soon as the pointer left
 * the row, which zeroed the `Menu` wrapper's rect. `Menu` re-places a portaled
 * list from that rect every animation frame, so the open session menu teleported
 * to the viewport corner and its close-on-pointer-leave then dismissed it —
 * every item unreachable by mouse. `.sessionRow.selected`, `.sessionRow.archived`
 * and the drag-marker compounds died the same way.
 *
 * `:local(...)`/`:global(...)` are scoping markers, not CSS: the wrapper has to
 * go (a browser drops the whole selector over the unknown pseudo-class) while
 * its content keeps the meaning it declares — global content is parked behind a
 * placeholder so the rename cannot reach it.
 *
 * Only selectors may be renamed. Comments and quoted strings are prose and data
 * (`Rows.tsx` in a comment is not a class; `content: '.rail'` is text), so both
 * are parked and restored verbatim — renaming them invented class-map entries
 * no selector referenced.
 *
 * Parking order matters: comments and globals are held BEFORE strings, so a
 * quote inside a parked region can never be held separately (a placeholder
 * nested inside another placeholder's text would survive the single restore
 * pass). Class renaming runs last, on text where every held region is a
 * NUL-delimited index.
 * @param cssText - the raw sheet.
 * @param hash - the per-module hash (already letter-prefixed).
 * @returns the rewritten sheet and its local → hashed class map.
 */
function hashSheet(cssText, hash) {
  const parked = []
  const hold = (text) => {
    parked.push(text)
    return `\u0000${parked.length - 1}\u0000`
  }
  const held = cssText
    .replace(/\/\*[\s\S]*?\*\//g, match => hold(match))
    .replace(/:local\(([^()]*)\)/g, '$1')
    .replace(/:global\(([^()]*)\)/g, (_match, inner) => hold(inner))
    .replace(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g, match => hold(match))
  const classMap = {}
  // A CSS value's decimal point is never followed by an identifier character
  // (`.5rem`), so `.name` only ever matches a class selector.
  const renamed = held.replace(/\.([A-Za-z_][A-Za-z0-9_-]*)/g, (_match, name) => {
    classMap[name] ??= `${hash}_${name}`
    return `.${classMap[name]}`
  })
  const rewritten = renamed.replace(/\u0000(\d+)\u0000/g, (_match, index) => parked[Number(index)])
  return { rewritten, classMap }
}

/**
 * CSS Module → JS module transform: hashed class map + tagged style injection.
 * Class names are `${hash}_${local}`; the hash covers the module path, so
 * rebuilt class names stay stable within one bundle revision. The hash is
 * prefixed with a letter ('m'): a `.${hash}_${local}` selector must start
 * with an identifier character — a bare hex digest frequently starts with a
 * digit, and CSSOM drops those rules as invalid (no styling at all).
 */
function cssModulesPlugin() {
  return {
    name: 'dsh-chat-manager-css-modules',
    setup(build) {
      build.onLoad({ filter: /\.module\.css$/ }, async (args) => {
        const cssText = await fs.promises.readFile(args.path, 'utf8')
        const rel = path.relative(SRC, args.path).replace(/\\/g, '/')
        const hash = 'm' + crypto.createHash('sha1').update(rel).digest('hex').slice(0, 6)
        const { rewritten, classMap } = hashSheet(cssText, hash)
        const contents = [
          `const cssText = ${JSON.stringify(rewritten)};`,
          `const classMap = ${JSON.stringify(classMap)};`,
          `const tagId = ${JSON.stringify(`dsh-chat-manager/${rel}`)};`,
          `if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {`,
          `  const tag = document.createElement("style");`,
          `  tag.dataset.plugin = "dsh-chat-manager";`,
          `  tag.dataset.pluginCss = tagId;`,
          `  tag.textContent = cssText;`,
          `  document.head.appendChild(tag);`,
          `}`,
          `export default classMap;`,
        ].join('\n')
        return { contents, loader: 'js' }
      })
    },
  }
}

/** Emit the browser bundle inside the platform factory registration shape. */
async function buildClient() {
  const result = await build({
    entryPoints: [path.join(SRC, 'client', 'index.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2020',
    external: PLATFORM_SEEDS,
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.MODE': '"production"',
      'import.meta.env': '{ "MODE": "production" }',
    },
    plugins: [cssModulesPlugin()],
    jsx: 'automatic',
    write: false,
    outfile: path.join(LIB, 'client.js'),
    sourcemap: false,
    minify: false,
  })
  const source = result.outputFiles[0].text
  const wrapped = [
    `window.__ModuleLoader__.load({`,
    `\tid: "dsh-chat-manager",`,
    `\tfactory: (require) => {`,
    `\t\tvar module = { exports: {} };`,
    `\t\tvar exports = module.exports;`,
    source,
    `\t\treturn module.exports;`,
    `\t}`,
    `});`,
    '',
  ].join('\n')
  fs.writeFileSync(path.join(LIB, 'client.js'), wrapped)
}

/** Emit the host half (ESM; node builtins stay external automatically). */
async function buildHost() {
  await build({
    entryPoints: [path.join(SRC, 'index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    write: false,
    outfile: path.join(LIB, 'index.js'),
    sourcemap: false,
    minify: false,
  }).then(result => {
    fs.writeFileSync(path.join(LIB, 'index.js'), result.outputFiles[0].text)
  })
}

fs.mkdirSync(LIB, { recursive: true })
await buildHost()
await buildClient()
console.log('built: lib/index.js, lib/client.js')
