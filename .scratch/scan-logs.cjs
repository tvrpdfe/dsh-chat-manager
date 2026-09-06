// Scan all session logs: message presence + first user-message content.
const z = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')
const root = process.env.USERPROFILE + '\\.dsh\\sessions'
for (const d of fs.readdirSync(root, { withFileTypes: true }).filter(x => x.isDirectory())) {
  const sub = path.join(root, d.name)
  for (const s of fs.readdirSync(sub, { withFileTypes: true }).filter(e => e.isDirectory())) {
    const log = path.join(sub, s.name, 'session.jsonl.zstd')
    if (!fs.existsSync(log)) continue
    const txt = z.zstdDecompressSync(fs.readFileSync(log)).toString('utf8')
    const lines = txt.split('\n')
    const userMsg = lines.find(l => l.includes('user/message') || l.includes('"role":"user"'))
    console.log(s.name, '| msg:', userMsg ? userMsg.slice(0, 110) : 'NONE', '| head:', txt.slice(0, 160).replace(/\n/g, ' | '))
  }
}
