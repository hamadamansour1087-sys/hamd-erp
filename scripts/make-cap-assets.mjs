/**
 * Generates Capacitor asset sources (assets/icon.png 1024², assets/splash.png 2732²)
 * from the existing brand icon at public/icons/icon-512.png.
 * Run once: bun scripts/make-cap-assets.mjs
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const ROOT = process.cwd()
const SRC = `${ROOT}/public/icons/icon-512.png`
const OUT = `${ROOT}/assets`

await mkdir(OUT, { recursive: true })

// 1) App icon — 1024×1024 upscale of the brand icon
await sharp(SRC)
  .resize(1024, 1024, { kernel: 'lanczos3' })
  .png()
  .toFile(`${OUT}/icon.png`)
console.log('✔ assets/icon.png (1024×1024)')

// 2) Splash — 2732×2732 canvas, brand background, centered logo (~30% of width)
const LOGO_PX = 820
const logo = await sharp(SRC).resize(LOGO_PX, LOGO_PX).png().toBuffer()
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: { r: 247, g: 253, b: 250, alpha: 1 } },
})
  .composite([{ input: logo, gravity: 'centre' }])
  .png()
  .toFile(`${OUT}/splash.png`)
console.log('✔ assets/splash.png (2732×2732)')
