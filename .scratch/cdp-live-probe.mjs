// Live-GUI probe against the user's running dsh web (127.0.0.1:3080):
// sidebar DOM, chat pane rows, console errors, localStorage, /state fetch.
import { launchChrome, connectPage, session, evaluate, runTool, sleep } from '../tools/cdp-lib.mjs'
import { createHash, createHmac } from 'node:crypto'

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
const COOKIE = `${cookieName}=v1.${body}.${sig}`

const browser = launchChrome({ port: PORT, windowSize: '1500x1000' })

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
  await cdp.send('Page.navigate', { url: URL })
  await sleep(9000)

  const lstat = await evaluate(cdp, `JSON.stringify({tombstones: (localStorage.getItem('dsh-chat-manager.deletedSessionIds')||null), theme: (localStorage.getItem('dsh-ui-theme')||null)})`)
  console.log('LOCALSTORAGE', lstat)

  const fetched = await evaluate(cdp, `fetch('/api/chat-manager/state').then(r=>r.json()).then(d=>JSON.stringify(d)).catch(e=>'FETCH_ERR '+e)`)
  console.log('STATE', fetched)

  const sidebar = await evaluate(cdp, `(() => {
    const root = document.querySelector('[data-dsh-slots="sidebar.workspaces"]') ?? document.querySelector('[id*="workspace"]') ?? document.body
    const text = (el) => el ? el.innerText.replace(/\\n+/g,' | ') : null
    const chat = [...document.querySelectorAll('*')].filter(el => el.childElementCount === 0 && el.textContent === '暂无聊天')
    return JSON.stringify({
      rootTag: root.tagName, rootClass: root.className,
      sidebarText: text(root)?.slice(0, 1200),
      bodyHasChatEmpty: chat.length,
    })
  })()`)
  console.log('SIDEBAR', sidebar)

  // Dump the sidebar region HTML (first 6000 chars) for structure inspection.
  const html = await evaluate(cdp, `(() => {
    const root = document.querySelector('[data-dsh-slots="sidebar.workspaces"]')
    return root ? root.outerHTML.slice(0, 6000) : 'NO ROOT'
  })()`)
  console.log('HTML', html)

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  if (shot?.result?.data) {
    const fs = await import('node:fs')
    fs.writeFileSync('.scratch/live-probe.png', Buffer.from(shot.result.data, 'base64'))
    console.log('SCREENSHOT saved .scratch/live-probe.png')
  }
  console.log('ERRORS', JSON.stringify(errors, null, 1))
  cdp.close()
}, (err) => { console.error('PROBE FAILED', err.message) })
