// Quick diagnostic: dump buttons/aria-labels + chat section state on cmtest.
import { launchChrome, connectPage, session, evaluate, runTool, sleep } from '../tools/cdp-lib.mjs'
import { createHash, createHmac } from 'node:crypto'

const PORT_ARG = process.argv[2] ?? '3087'
const PORT = 9235
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
  await sleep(11000)
  const diag = await evaluate(cdp, `(() => {
    const buttons = [...document.querySelectorAll('button')].slice(0, 40).map(b => ({
      label: b.getAttribute('aria-label'), text: (b.textContent ?? '').trim().slice(0, 12),
      title: (b.getAttribute('title') ?? ''),
    }))
    const chatHeader = [...document.querySelectorAll('span')].find(el => el.textContent === '聊天')?.parentElement
    return JSON.stringify({
      buttons,
      chatHeaderHTML: chatHeader ? chatHeader.innerHTML.slice(0, 600) : 'NONE',
      hasEditor: !!document.querySelector('[contenteditable="true"]'),
      bodySnippet: document.body.innerText.slice(0, 300),
    })
  })()`)
  console.log('DIAG', diag)
  cdp.close()
}, (err) => { console.error('PROBE FAILED', err.message) })
