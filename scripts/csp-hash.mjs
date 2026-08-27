import { createHash } from 'crypto'
import { readFileSync } from 'fs'

const src = readFileSync('src/app/layout.tsx', 'utf8')
const m = src.match(/const earlyBootScript = `([^`]*)`/)
if (!m) {
  console.error('earlyBootScript not found')
  process.exit(1)
}
const hash = createHash('sha256').update(m[1]).digest('base64')
console.log(`'sha256-${hash}'`)
