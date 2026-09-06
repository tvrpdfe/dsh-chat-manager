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

const SCRIPT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)))
const PKG = path.resolve(SCRIPT_DIR, '..')
const SRC = path.join(PKG, 'src')
const LIB = path.join(PKG, 'lib')

/** Platform seed words: the ONLY entities the web shell shares into the module table. */
const PLATFORM_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

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
        const classMap = {}
        for (const match of cssText.matchAll(/\.[A-Za-z_][A-Za-z0-9_-]*/g)) {
          const local = match[0].slice(1)
          classMap[local] = `${hash}_${local}`
        }
        const rewritten = cssText.replace(
          /(^|[^\w-])\.([A-Za-z_][A-Za-z0-9_-]*)(?=[^A-Za-z0-9_-]|$)/g,
          (m, prefix, local) => `${prefix}.${classMap[local] ?? local}`,
        )
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
    external: PLATFORM_EXTERNALS,
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
