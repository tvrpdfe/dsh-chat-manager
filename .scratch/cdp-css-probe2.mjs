// Probe v4: empirical CSS selector validity + rule presence for digit-leading class.
import { launchChrome, connectPage, session, evaluate, runTool, sleep } from '../tools/cdp-lib.mjs'
import { createHash, createHmac } from 'node:crypto'

const PORT = 9232
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

const browser = launchChrome({ port: PORT })

await runTool(browser, async () => {
  const ws = await connectPage(PORT)
  if (!ws) throw new Error('no page target')
  const cdp = session(ws)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')
  await cdp.send('Network.setCookie', {
    name: cookieName, value: `v1.${body}.${sig}`, url: 'http://127.0.0.1:3080/', path: '/',
  })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1800, height: 1100, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: URL })
  await sleep(10000)

  const result = await evaluate(cdp, `(() => {
    const out = {}
    // 1. Is '.02ab30_x' a valid selector that matches?
    try {
      const el = [...document.querySelectorAll('span')].find(el => el.textContent === '工作区')
      const cls = String(el?.className ?? '').split(' ')[0]
      out.cls = cls
      try { out.qsMatches = document.querySelector('.' + cls) !== null } catch (e) { out.qsErr = e.message }
      // 2. Does a CSS rule for this class exist in any sheet?
      let rules = []
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            const sel = rule.selectorText ?? ''
            if (sel.indexOf('.' + cls) !== -1) {
              rules.push({ sheet: sheet === null ? '?' : 'n/a', sel: sel.slice(0, 100), decls: (rule.style?.cssText ?? '').slice(0, 200) })
            }
          }
        } catch (e) { out.sheetError = String(e.message ?? e) }
      }
      out.rules = rules.slice(0, 6)
      // 3. Computed style of the header directly
      const header = el?.parentElement
      if (header) {
        const cs = getComputedStyle(header)
        out.headerDisplay = cs.display
        out.headerFlexDirection = cs.flexDirection
      }
      // 4. Sample: what rules exist for the root class anywhere
      const rootCls = '02ab30_root'
      let rootRules = 0
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if ((rule.selectorText ?? '').includes(rootCls)) rootRules++
          }
        } catch {}
      }
      out.rootRuleCount = rootRules
    } catch (e) {
      out.fatal = String(e.message ?? e)
    }
    return JSON.stringify(out)
  })()`)
  console.log('RESULT', result)
  cdp.close()
}, (err) => { console.error('PROBE FAILED', err.message) })
