// Assert the existing e2e outcome (single 2-word slug + single registry
// entry + matching folder), then clean the probe's chat session up: delete
// via the host route and remove my empty slug folder.
import { readFileSync, rmSync, readdirSync } from 'node:fs'
import path from 'node:path'

const BASE = 'http://127.0.0.1:3087'
const DATE_FOLDER = 'E:\\Documents\\DSH\\2026-09-06'
const REGISTRY = path.join(DATE_FOLDER, '.dsh-chat.json')

const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'))
const entries = Object.entries(reg.sessions ?? {})
console.log('ENTRIES', entries.length)
const [sid, entry] = entries[0] ?? [null, null]
const slugWords = (s) => String(s ?? '').split('-').filter(Boolean).length
console.log('SLUG', entry?.slug, 'WORDS', entry ? slugWords(entry.slug) : 0)
const dirs = readdirSync(DATE_FOLDER, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
const ok = entries.length === 1
  && entry !== null
  && slugWords(entry.slug) >= 2 && slugWords(entry.slug) <= 4
  && entry.folder.endsWith(`\\${entry.slug}`)
  && dirs.includes(entry.slug)
console.log('E2E_OK', ok)
if (!ok) process.exitCode = 1

const res = await fetch(`${BASE}/api/chat-manager/delete-session`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sessionId: sid }),
})
const del = await res.json()
console.log('DELETE', JSON.stringify(del), res.status)
await new Promise(r => setTimeout(r, 1200))
rmSync(path.join(DATE_FOLDER, entry.slug), { recursive: true, force: true })
console.log('REGISTRY_AFTER', readFileSync(REGISTRY, 'utf8').trim())
