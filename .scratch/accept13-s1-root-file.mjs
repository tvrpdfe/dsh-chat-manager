// S1 acceptance on a real Host: the chat root exists but cannot be listed
// (`DSH_CHAT_MANAGER_ROOT` points at a regular file). A delete must still
// succeed — log removal is the primary operation — and the skipped registry
// sweep must be diagnosable, not silent.
//
// Usage: node .scratch/accept13-s1-root-file.mjs <url> <host-stderr-log>
import fs from 'node:fs'
import { openApp, check, finish } from './accept2-lib.mjs'

const URL = process.argv[2]
const LOG = process.argv[3]
if (!URL || !LOG) { console.error('usage: node accept13-s1-root-file.mjs <url> <host-stderr-log>'); process.exit(2) }
const app = await openApp({ url: URL, port: Number(process.env.ACCEPT_CDP_PORT ?? 9419) })
try {
  await app.navigate()
  await app.waitForApp({ attempts: 90, intervalMs: 2000 })
  const linesBefore = fs.readFileSync(LOG, 'utf8').split(/\r?\n/).filter(Boolean).length
  const out = await app.evaluate(`fetch('/api/chat-manager/delete-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session-ghost-s1-root-file' }),
  }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }))`)
  const linesAfter = fs.readFileSync(LOG, 'utf8').split(/\r?\n/).filter(Boolean).length
  const newLines = fs.readFileSync(LOG, 'utf8').split(/\r?\n/).filter(Boolean).slice(linesBefore)
  check('1 a ghost delete still answers 200 when the chat root cannot be listed', out.status === 200, JSON.stringify(out))
  check('2 the response says the accounting cleanup ran', out.body?.ok === true, JSON.stringify(out.body))
  check('3 the skipped registry sweep is warned about', newLines.some(line => line.includes('chat root could not be listed')), JSON.stringify(newLines))
  check('4 the warning names the delete-relevant consequence', newLines.some(line => line.includes('chat registry cleanup is skipped')), JSON.stringify(newLines))
  check('5 the warning carries the plugin prefix', newLines.some(line => line.includes('[dsh-chat-manager]')), JSON.stringify(newLines))
  check('6 no console error or exception', app.consoleErrors().length === 0, JSON.stringify(app.consoleErrors().map(e => e.text.slice(0, 200))))
  await app.screenshot('.scratch/accept13-s1-root-file.png')
} finally {
  await app.close()
}
finish('accept13-s1-root-file')
