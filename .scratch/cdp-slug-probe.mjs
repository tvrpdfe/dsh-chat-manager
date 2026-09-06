// Slug e2e against the cmtest instance: add a chat, type "hello" then fast
// "world" (within the LLM window), assert ONE 2-word slug folder + one
// registry entry, then clean the test session up (session deleted, my own
// empty hello-session folder removed).
import { launchChrome, connectPage, session, evaluate, runTool, sleep } from '../tools/cdp-lib.mjs'
import { createHash, createHmac } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const PORT_ARG = process.argv[2] ?? '3087'
const PORT = 9234
const URL = `http://127.0.0.1:${PORT_ARG}`
const SECRET = '9XJ5SOb5urXETDshBH5glfUhCwjBDetS0ojQzaKtNYk'
const AUTHORITY = `127.0.0.1:${PORT_ARG}`
const b64url = (buf) => Buffer.from(buf).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
const cookieName = 'dsh-auth-' + b64url(createHash('sha256').update(AUTHORITY).digest())
const issuedAt = Date.now()
const payload = { version: 1, authority: AUTHORITY, issuedAt, expiresAt: issuedAt + 3600_000 }
const body = b64url(Buffer.from(JSON.stringify(payload)))
const key = Buffer.from(SECRET.replaceAll('-', '+').replaceAll('_', '/') + '=', 'base64')
const sig = b64url(createHmac('sha256', key).update(body).digest())

const DATE_FOLDER = 'E:\\Documents\\DSH\\2026-09-06'
const REGISTRY = path.join(DATE_FOLDER, '.dsh-chat.json')

function readRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY, 'utf8'))
  } catch {
    return { sessions: {} }
  }
}

const browser = launchChrome({ port: PORT })

await runTool(browser, async () => {
  const ws = await connectPage(PORT)
  if (!ws) throw new Error('no page target')
  const cdp = session(ws)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')
  await cdp.send('Network.setCookie', {
    name: cookieName, value: `v1.${body}.${sig}`, url: URL + '/', path: '/',
  })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1800, height: 1100, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: URL })
  await sleep(10000)

  const before = readRegistry()
  console.log('BEFORE', JSON.stringify(before))

  // 1) Click the chat pane's "新建聊天" button.
  const clicked = await evaluate(cdp, `(() => {
    const byLabel = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '新建聊天')
    if (byLabel) { byLabel.click(); return 'aria-label' }
    const byTitle = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '+')
    if (byTitle) { byTitle.click(); return 'text-plus' }
    return 'none'
  })()`)
  console.log('ADD_CLICK', clicked)
  await sleep(3000)

  // 2) Focus the composer (contenteditable) and type.
  const focused = await evaluate(cdp, `(() => {
    const ed = document.querySelector('[contenteditable="true"]')
    if (!ed) return 'no-editor'
    ed.focus()
    return 'ok'
  })()`)
  console.log('FOCUS', focused)
  if (focused === 'no-editor') throw new Error('composer contenteditable not found')
  await sleep(500)
  await cdp.send('Input.insertText', { text: 'hello' })
  await sleep(300)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
  await sleep(700)
  // 3) Second message inside the slug window (dedup check).
  const focused2 = await evaluate(cdp, `(() => { const ed = document.querySelector('[contenteditable="true"]'); if (ed) ed.focus(); return !!ed })()`)
  console.log('FOCUS2', focused2)
  if (focused2) {
    await cdp.send('Input.insertText', { text: 'world' })
    await sleep(300)
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
  }
  console.log('SENT, waiting for slug generation…')
  await sleep(20000)

  // 4) Disk assertions.
  const after = readRegistry()
  const entries = Object.entries(after.sessions ?? {})
  console.log('AFTER', JSON.stringify(after))
  console.log('REGISTRY_ENTRIES', entries.length)
  const slugs = entries.map(([, e]) => e.slug).sort()
  console.log('SLUGS', JSON.stringify(slugs))
  const dirs = fs.existsSync(DATE_FOLDER)
    ? fs.readdirSync(DATE_FOLDER, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
    : []
  console.log('DIRS', JSON.stringify(dirs))
  const okSlug = entries.length === 1 && slugs[0] === 'hello-session' && dirs.includes('hello-session')
  console.log('SLUG_E2E_OK', okSlug)
  if (!okSlug) throw new Error(`slug e2e failed: ${JSON.stringify({ entries, slugs, dirs })}`)

  // 5) Cleanup: delete the test chat session; remove my empty slug folder.
  const sid = entries[0][0]
  const del = await fire('POST', 'delete-session', { sessionId: sid })
  console.log('DELETE', JSON.stringify(del))
  await sleep(1500)
  fs.rmSync(path.join(DATE_FOLDER, 'hello-session'), { recursive: true, force: true })
  console.log('AFTER_CLEANUP', JSON.stringify(readRegistry()))
  cdp.close()

  function fire(method, action, payload) {
    return new Promise((resolve) => {
      const http = method === 'GET' ? null : { // not used
      }
      void http
      fetch(`${URL}/api/chat-manager/${action}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      }).then(r => r.json()).then(resolve).catch(e => resolve({ error: String(e) }))
    })
  }
}, (err) => { console.error('PROBE FAILED', err.message) })
