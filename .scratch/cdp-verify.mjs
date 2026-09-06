// Verify probe for a given port: styled layout + chat pane rows + errors.
// usage: node cdp-verify.mjs <port>
import { launchChrome, connectPage, session, evaluate, runTool, sleep } from '../tools/cdp-lib.mjs'
import { createHash, createHmac } from 'node:crypto'
import fs from 'node:fs'

const PORT_ARG = process.argv[2] ?? '3087'
const PORT = 9233
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
    name: cookieName, value: `v1.${body}.${sig}`, url: URL + '/', path: '/',
  })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1800, height: 1100, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: URL })
  await sleep(11000)

  const diag = await evaluate(cdp, `(() => {
    const label = [...document.querySelectorAll('span')].find(el => el.textContent === '工作区')
    const header = label?.parentElement
    const cs = header ? getComputedStyle(header) : null
    const cls = label ? label.className.split(' ')[0] : null
    const chatEmpty = [...document.querySelectorAll('*')].some(el => el.childElementCount === 0 && el.textContent === '暂无聊天')
    return JSON.stringify({
      cls,
      headerDisplay: cs?.display ?? null,
      headerFlexDirection: cs?.flexDirection ?? null,
      chatEmpty,
    })
  })()`)
  console.log('DIAG', diag)

  const sidebar = await evaluate(cdp, `(() => {
    const all = [...document.querySelectorAll('div,aside')]
    const cands = all.filter(el => el.innerText.includes('工作区') && el.innerText.includes('聊天') && el.childElementCount > 0)
    cands.sort((a,b) => a.innerText.length - b.innerText.length)
    return cands[0] ? cands[0].innerText.replace(/\\n+/g,' | ').slice(0, 600) : 'NONE'
  })()`)
  console.log('SIDEBAR', sidebar)

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  if (shot?.result?.data) {
    fs.writeFileSync(`.scratch/verify-${PORT_ARG}.png`, Buffer.from(shot.result.data, 'base64'))
    console.log('SHOT saved')
  }

  // Settings → archived-sessions tab.
  await evaluate(cdp, `(() => { const b = [...document.querySelectorAll('button,[role=button],a')].find(e => (e.textContent ?? '').trim() === '设置'); b?.click(); })()`)
  await sleep(1200)
  await evaluate(cdp, `(() => {
    const els = [...document.querySelectorAll('button, [role=tab], [role=button], span, div')]
    const t = els.find(e => (e.textContent ?? '').trim() === '已归档会话' && e.children.length <= 1)
    if (t) t.click(); return !!t
  })()`)
  await sleep(1500)
  const archived = await evaluate(cdp, `(() => {
    const rows = [...document.querySelectorAll('[class*="archivedRow"]')].map(row => {
      const timeEl = row.querySelector('[class*="archivedTime"]')
      return {
        timeText: (timeEl?.textContent ?? '').trim(),
        buttons: [...row.querySelectorAll('button')].map(b => (b.textContent ?? '').trim()),
      }
    })
    return JSON.stringify({
      rows,
      rawKeyLeak: /time\\.(days|minutes|hours|months|years|now|ago)/.test(document.body.innerText),
    })
  })()`)
  const archivedData = JSON.parse(archived)
  // Fail fast: every archived row must carry a count+unit relative-time label
  // or the localized 刚刚; the unit regex is anchored per row (a bare 天/年
  // anywhere in the body would pass too broadly).
  const timeLabel = /^(刚刚|\d+分钟|\d+小时|\d+天|\d+个月|\d+年)$/u
  const badRows = archivedData.rows.filter(row => !timeLabel.test(row.timeText))
  if (archivedData.rows.length === 0 || badRows.length > 0) {
    throw new Error(`archived rows must have a count+unit time label (rows=${archivedData.rows.length}, bad=${JSON.stringify(badRows)})`)
  }
  if (!archivedData.rows.some(row => row.buttons.includes('恢复') && row.buttons.includes('删除'))) {
    throw new Error('archived rows must have 恢复+删除 buttons')
  }
  if (archivedData.rawKeyLeak) {
    throw new Error('raw time.* key leaked into the page text')
  }
  console.log('ARCHIVED rows=' + archivedData.rows.length, JSON.stringify(archivedData))

  console.log('ERRORS', JSON.stringify(errors, null, 1))
  cdp.close()
}, (err) => { console.error('PROBE FAILED', err.message) })
