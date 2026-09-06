// Check the client bundle's require set against the platform seed words.
import fs from 'node:fs'
const s = fs.readFileSync('lib/client.js', 'utf8')
const reqs = [...s.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1])
const uniq = [...new Set(reqs)].sort()
const seeds = new Set([
  'react', 'react/jsx-runtime', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
])
console.log('REQUIRES', JSON.stringify(uniq))
const outside = uniq.filter((r) => !seeds.has(r))
console.log('OUTSIDE_SEEDS', JSON.stringify(outside))
process.exitCode = outside.length === 0 ? 0 : 1
