// Probe v3: CSS diagnostics — style tags, class map hits, computed layout.
import { launchChrome, connectPage, session, evaluate, runTool, sleep } from '../tools/cdp-lib.mjs'
import { createHash, createHmac } from 'node:crypto'

const PORT = 9231
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

  const diagnostic = await evaluate(cdp, `(() => {
    const tags = [...document.querySelectorAll('style[data-plugin-css]')].map(t => ({
      id: t.getAttribute('data-plugin-css'), len: t.textContent.length,
      sample: t.textContent.slice(0, 120),
    }))
    // the sidebar region: find the element whose text starts with 工作区 and is narrow
    const label = [...document.querySelectorAll('span')].find(el => el.textContent === '工作区')
    const header = label?.parentElement
    return JSON.stringify({
      pluginStyleTags: tags,
      allStyleTags: [...document.querySelectorAll('style')].map(t => t.id || t.getAttribute('data-plugin-css') || ('anon' + t.textContent.length)),
      label: label ? { cls: label.className, display: getComputedStyle(label).display } : null,
      header: header ? { cls: header.className, display: getComputedStyle(header).display, flexDirection: getComputedStyle(header).flexDirection, childCount: header.childElementCount } : null,
      headerChildren: header ? [...header.children].map(c => ({ tag: c.tagName, cls: String(c.className).slice(0, 60) })) : null,
    })
  })()`)
  console.log('DIAG', diagnostic)

  // CSS rule lookup: does a rule exist for the actual label class?
  const ruleCheck = await evaluate(cdp, `(() => {
    const label = [...document.querySelectorAll('span')].find(el => el.textContent === '工作区')
    if (!label) return 'no label'
    const cls = label.className
    const rules = []
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText && rule.selectorText.includes(cls)) {
            rules.push({ sel: rule.selectorText.slice(0, 80), text: rule.cssText.slice(0, 160) })
          }
        }
      } catch {}
    }
    return JSON.stringify({ cls, ruleCount: rules.length, rules: rules.slice(0, 5) })
  })()`)
  console.log('RULES', ruleCheck)
  cdp.close()
}, (err) => { console.error('PROBE FAILED', err.message) })
