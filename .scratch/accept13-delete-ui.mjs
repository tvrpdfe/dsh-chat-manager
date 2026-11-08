// Row-menu delete acceptance for the S1–S8 round. It loads the plugin into a
// throwaway Host (DSH_HOME copy + isolated chat root), expands the workspace
// that holds a Session this Host can read, and deletes that Session through the
// real menu path. Assertions cover the parts this round touched: the route still
// returns 200, removes the log directory, detaches the workspace slot, keeps a
// sibling Session in the same workspace, and does not reload the page.
//
// Usage: DSH_HOME=<throwaway home> node .scratch/accept13-delete-ui.mjs <url>
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openApp, check, finish, sleep } from './accept2-lib.mjs'

const URL = process.argv[2]
if (!URL) { console.error('usage: node accept13-delete-ui.mjs <url>'); process.exit(2) }
if (!process.env.DSH_HOME) {
  console.error('refusing to run: set DSH_HOME to a throwaway copy of the home (this probe deletes a Session)')
  process.exit(2)
}
const DSH = process.env.DSH_HOME
const SESSIONS = path.join(DSH, 'sessions')
const LEDGER = path.join(DSH, 'storages', 'workspace.json')
const PORT = Number(process.env.ACCEPT_CDP_PORT ?? 9418)
const SID = 'session-4b9d16f1-444e-46f2-bc0d-c089a7a75d07'
const SIBLING = 'session-a6c7d5ec-0454-416b-bcb4-ef2847ecc088'
const WORKSPACE = '82396513-e2d3-4161-a43c-57d2f7e772b0'
const ROW = `[data-row-key="session:${SID}"]`

function dirsOf(id) {
  const out = []
  for (const slug of fs.existsSync(SESSIONS) ? fs.readdirSync(SESSIONS) : []) {
    const dir = path.join(SESSIONS, slug, id)
    if (fs.existsSync(dir)) out.push(dir)
  }
  return out
}
function ledger() {
  const state = JSON.parse(fs.readFileSync(LEDGER, 'utf8'))
  return {
    workspace: state.tables.workspaces[WORKSPACE],
    pinned: state.global.pinnedSessionIds ?? [],
    archived: state.global.archivedSessionIds ?? [],
  }
}

const before = ledger()
check('0 the fixture is in its workspace before the delete', Array.isArray(before.workspace?.sessionIds) && before.workspace.sessionIds.includes(SID), JSON.stringify(before.workspace?.sessionIds))
check('0b the fixture has a log directory', dirsOf(SID).length > 0, JSON.stringify(dirsOf(SID)))

const app = await openApp({ url: URL, port: PORT })
let failed = false
try {
  await app.navigate()
  if (!(await app.waitForApp({ attempts: 90, intervalMs: 2000 }))) throw new Error('app never rendered rows')
  await sleep(2500)
  const marker = await app.evaluate(`({ nav: performance.getEntriesByType('navigation').length, origin: performance.timeOrigin })`)
  const archivedAtStart = await app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => j.archived.map(a => a.sessionId))`)

  // Expand the workspace holding the fixture; its groups start collapsed in a
  // fresh browser profile, so the Session row does not exist until this click.
  const wsRect = await app.rect(`[data-row-key="workspace:${WORKSPACE}"]`)
  check('1 the fixture workspace has a row', wsRect !== null, JSON.stringify(wsRect))
  if (wsRect === null) throw new Error('no workspace row')
  await app.mouseClick(wsRect.x, wsRect.y)
  let rowRect = null
  for (let i = 0; i < 30 && rowRect === null; i += 1) {
    await sleep(500)
    rowRect = await app.rect(ROW)
  }
  check('2 expanding the workspace reveals the fixture row', rowRect !== null, JSON.stringify(rowRect))
  if (rowRect === null) throw new Error('fixture row never appeared')

  const rowTitle = await app.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(ROW)}); return r === null ? null : (r.innerText || '').split('\\n')[0]; })()`)
  check('3 the fixture row is non-blank (it has a verb strip)', (await app.evaluate(`document.querySelector(${JSON.stringify(ROW)} + ' [class$=_rowActions]') !== null`)) === true, rowTitle)

  // Hover is what reveals the strip upstream.
  const rect = await app.rect(ROW)
  await app.mouseMove(rect.x, rect.y)
  await sleep(500)
  const trigger = await app.evaluate(`(() => {
    const r = document.querySelector(${JSON.stringify(ROW)});
    const b = r === null ? undefined : [...r.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '').includes('的操作'));
    if (b === undefined) return null;
    const br = b.getBoundingClientRect();
    return { x: Math.round(br.x + br.width / 2), y: Math.round(br.y + br.height / 2) };
  })()`)
  check('4 the hovered row offers its menu trigger', trigger !== null, JSON.stringify(trigger))
  if (trigger === null) throw new Error('no row menu trigger')
  await app.mouseClick(trigger.x, trigger.y)
  await sleep(400)

  const menu = await app.evaluate(`(() => {
    const l = document.querySelector('[role=menu]');
    return l === null ? null : [...l.querySelectorAll('button[role=menuitem]')].map(b => (b.textContent || '').trim());
  })()`)
  check('5 the plugin menu lists the five actions, delete included', Array.isArray(menu) && menu.length === 5 && menu.includes('删除会话'), JSON.stringify(menu))
  const item = await app.evaluate(`(() => {
    const l = document.querySelector('[role=menu]');
    const b = l === null ? undefined : [...l.querySelectorAll('button[role=menuitem]')].find(x => (x.textContent || '').trim() === '删除会话');
    if (b === undefined) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`)
  check('6 删除会话 is reachable with a real box', item !== null, JSON.stringify(item))
  if (item === null) throw new Error('no delete item')
  await app.mouseClick(item.x, item.y)
  await sleep(800)

  const dialog = await app.evaluate(`(() => {
    const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')];
    const d = all[all.length - 1];
    if (d === undefined) return { count: all.length, title: null, description: null, buttons: [] };
    return {
      count: all.length,
      title: (d.querySelector('h2') || {}).textContent ?? null,
      description: (d.querySelector('p') || {}).textContent ?? null,
      buttons: [...d.querySelectorAll('button')].map(b => (b.textContent || '').trim()),
    };
  })()`)
  check('7 the first confirmation is a delete dialog (not the busy one)', dialog.title === '删除会话' && dialog.buttons.includes('删除会话') && !dialog.buttons.includes('停止并删除'), JSON.stringify(dialog))
  const nameMatches = typeof rowTitle === 'string' && rowTitle.length >= 2 && (dialog.description ?? '').includes(rowTitle.slice(0, 2))
  check('8 the dialog names the fixture', nameMatches, `row="${rowTitle}" desc="${dialog.description}"`)
  await app.screenshot('.scratch/accept13-delete-dialog.png')

  const confirm = await app.evaluate(`(() => {
    const all = [...document.querySelectorAll('[role=dialog][aria-modal=true]')];
    const d = all[all.length - 1];
    const b = d === undefined ? undefined : [...d.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '删除会话');
    if (b === undefined) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`)
  check('9 the delete button has a real box', confirm !== null, JSON.stringify(confirm))
  if (confirm === null) throw new Error('no confirm button')
  await app.mouseClick(confirm.x, confirm.y)

  // The route flushes and re-asks activity before removing the directory; give
  // it a few seconds, then assert on disk rather than on the toast.
  let dirsAfter = dirsOf(SID)
  for (let i = 0; i < 30 && dirsAfter.length > 0; i += 1) {
    await sleep(500)
    dirsAfter = dirsOf(SID)
  }
  const after = await app.evaluate(`({
    dialogs: document.querySelectorAll('[role=dialog][aria-modal=true]').length,
    stillInDom: document.querySelector(${JSON.stringify(ROW)}) !== null,
    marker: document.documentElement.dataset.a13 ?? 'none',
    nav: performance.getEntriesByType('navigation').length,
    origin: performance.timeOrigin,
  })`)
  const net = app.events.filter(e => e.kind === 'net' && e.text.includes('/api/chat-manager/delete-session')).map(e => e.text.slice(0, 120))
  const status = net.length === 0 ? null : Number(net[net.length - 1].split(' ')[0])
  const afterLedger = ledger()
  const folderAfter = await app.evaluate(`fetch('/api/chat-manager/state').then(r => r.json()).then(j => Boolean((j.folders || {})[${JSON.stringify(SID)}]))`).catch(() => null)

  check('10 the delete route answered 200', status === 200, JSON.stringify(net))
  check('11 the row left the DOM', after.stillInDom === false, JSON.stringify(after))
  check('12 the dialog closed', after.dialogs === 0, JSON.stringify(after))
  check('13 the persisted log directory is GONE', dirsAfter.length === 0, `before=${JSON.stringify(dirsOf(SID))}`)
  check('14 the sibling Session in the same workspace is untouched', dirsOf(SIBLING).length > 0, JSON.stringify(dirsOf(SIBLING)))
  check('15 the workspace no longer lists the deleted id', Array.isArray(afterLedger.workspace?.sessionIds) && !afterLedger.workspace.sessionIds.includes(SID), JSON.stringify(afterLedger.workspace?.sessionIds))
  check('16 the sibling is still in the workspace', afterLedger.workspace?.sessionIds?.includes(SIBLING) === true, JSON.stringify(afterLedger.workspace?.sessionIds))
  check('17 the pin set never held the fixture and is unchanged', !before.pinned.includes(SID) && !afterLedger.pinned.includes(SID), JSON.stringify(afterLedger.pinned))
  check('18 the archived set is unchanged', JSON.stringify(afterLedger.archived) === JSON.stringify(archivedAtStart), `start=${JSON.stringify(archivedAtStart)} after=${JSON.stringify(afterLedger.archived)}`)
  check('19 no full page reload', after.nav === marker.nav && after.origin === marker.origin)
  check('20 no console error or exception', app.consoleErrors().length === 0, JSON.stringify(app.consoleErrors().map(e => e.text.slice(0, 200))))
  check('21 the chat-folder registry never named the fixture', folderAfter === false, String(folderAfter))
} catch (err) {
  failed = true
  check('probe completed without throwing', false, err.message)
  await app.screenshot('.scratch/accept13-delete-failure.png').catch(() => {})
} finally {
  await app.close()
}
if (failed) process.exitCode = 1
finish('accept13-delete-ui')
