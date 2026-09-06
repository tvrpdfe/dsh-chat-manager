// Live-GUI probe v2: force wide viewport, dump sidebar DOM + chat pane.
import { launchChrome, connectPage, session, evaluate, runTool, sleep } from '../tools/cdp-lib.mjs'
import { createHash, createHmac } from 'node:crypto'
import fs from 'node:fs'

const PORT = 9230
const URL = 'http://127.0.0.1:3080'
const SECRET = '9XJ5SOb5urXETDshBH5glfUhCwjBDetS0ojQzaKtNYk'
const AUTHORITY = '127.0.0.1:3080'
const b64url = (buf) => Buffer.from(buf).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
const cookieName = 'dsh-auth-' + b64url(createHash('sha256').update(AUTHORITY).digest())
const issuedAt = Date.now()
const payload = { version: 1, authority: AUTHORITY, issuedAt, expiresAt: issuedAt + 3600_000 }
const body = b64url(Buffer.from(JSON.stringify(payload)))
const key = Buffer.from(SECRET.replaceAll('-', '+').replaceAll('_', '/') + '=', 'base64')
const sig = b64url(createHmac('sha256', key).update(body).digest())

const browser = launchChrome({ port: PORT, windowSize: '1800x1100' })

await runTool(browser, async () => {
  const ws = await connectPage(PORT)
  if (!ws) throw new Error('no page target')
  const cdp = session(ws)
  await cdp.send('Runtime.enable')
  await cdp.send('Log.enable')
  const errors = []
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push('EXC: ' + (msg.params?.exceptionDetails?.exception?.description ?? msg.params?.exceptionDetails?.text ?? '?'))
    }
    if (msg.method === 'Log.entryAdded' && msg.params?.entry?.level === 'error') {
      errors.push('LOG: ' + msg.params.entry.text)
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      errors.push('CONSOLE: ' + msg.params.args?.map(a => a.value ?? a.description).join(' '))
    }
  })
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')
  await cdp.send('Network.setCookie', {
    name: cookieName, value: `v1.${body}.${sig}`, url: 'http://127.0.0.1:3080/', path: '/',
  })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1800, height: 1100, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: URL })
  await sleep(10000)

  console.log('VIEWPORT', await evaluate(cdp, 'JSON.stringify({w: innerWidth, h: innerHeight, collapsed: !!document.querySelector("[data-sidebar-collapsed]")})'))
  console.log('TEXT', await evaluate(cdp, `document.body.innerText.slice(0, 700)`))

  // find the smallest ancestor containing both 工作区 and 聊天
  const info = await evaluate(cdp, `(() => {
    const all = [...document.querySelectorAll('div,aside,section,main,nav')]
    const hasWs = el => el.innerText.includes('工作区') || el.innerText.includes('Chats') || el.innerText.includes('Workspaces')
    const hasChat = el => el.innerText.includes('聊天') || el.innerText.includes('Chat')
    const cands = all.filter(el => hasWs(el) && hasChat(el) && el.childElementCount > 0)
    cands.sort((a,b) => a.innerText.length - b.innerText.length)
    const el = cands[0]
    return JSON.stringify({
      found: el ? { tag: el.tagName, cls: el.className, len: el.innerText.length, text: el.innerText.replace(/\\n+/g,' | ').slice(0, 900) } : null,
    })
  })()`)
  console.log('PANES', info)

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  if (shot?.result?.data) {
    fs.writeFileSync('.scratch/live-probe2.png', Buffer.from(shot.result.data, 'base64'))
    console.log('SCREENSHOT saved')
  }
  console.log('ERRORS', JSON.stringify(errors, null, 1))
  cdp.close()
}, (err) => { console.error('PROBE FAILED', err.message) })
