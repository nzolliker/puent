/**
 * End-to-end check for the photo upload.
 *
 * curl cannot test this feature: the interesting half runs in the browser --
 * HEIC decoding, the canvas conversion, and the FormData the client builds.
 * Every bug this page had was invisible to a curl request and obvious here.
 *
 *   bun run test:e2e            # needs the app running (bun run dev + vite)
 *   BASE=http://localhost:3000 bun run test:e2e   # against the built frontend
 *
 * WebKit stands in for Safari, which is what the garden group uses.
 */
import { webkit, chromium } from 'playwright'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const dir = mkdtempSync(join(tmpdir(), 'puent-e2e-'))
let failures = 0

function check(label, actual, expected) {
  const ok = actual === expected
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}: ${actual}${ok ? '' : ` (erwartet ${expected})`}`)
  if (!ok) failures++
}

/** A JPEG, and the HEIC an iPhone would actually produce. */
function fixtures() {
  const jpeg = join(dir, 'garten.jpg')
  const heic = join(dir, 'IMG_0042.HEIC')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <rect width="1200" height="900" fill="#5a8f3c"/><circle cx="600" cy="450" r="260" fill="#3f5f9e"/></svg>`
  const svgPath = join(dir, 'src.svg')
  writeFileSync(svgPath, svg)
  execFileSync('sips', ['-s', 'format', 'jpeg', svgPath, '--out', jpeg], { stdio: 'ignore' })
  execFileSync('sips', ['-s', 'format', 'heic', jpeg, '--out', heic], { stdio: 'ignore' })
  return { jpeg, heic }
}

/**
 * Six untouched iPhone photos are ~26 MB and would blow the 15 MB request
 * limit. They only fit because the browser scales them down first, so this
 * guards that behaviour, not just the happy path.
 */
async function uploadMany(file, copies = 6) {
  const browser = await webkit.launch()
  const page = await browser.newPage()
  let status = null
  page.on('response', (r) => {
    if (r.url().includes('/api/photos') && r.request().method() === 'POST') status = r.status()
  })
  await page.goto(`${BASE}/fotos`, { waitUntil: 'networkidle' })
  const before = await page.locator('img[src^="/uploads"]').count()
  await page.getByRole('button', { name: /Hochladen/ }).first().click()
  await page.locator('input[type=file]').setInputFiles(Array(copies).fill(file))
  await page.getByRole('button', { name: /hochladen$/i }).last().click()
  await page.waitForTimeout(30000)
  check(`${copies} grosse Fotos: POST-Status`, status, 201)
  check(`${copies} grosse Fotos: alle im Grid`, await page.locator('img[src^="/uploads"]').count(), before + copies)
  await browser.close()
}

async function upload(browserType, name, file, expectUpload) {
  const browser = await browserType.launch()
  const page = await browser.newPage()
  let status = null
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => {
    if (r.url().includes('/api/photos') && r.request().method() === 'POST') status = r.status()
  })

  await page.goto(`${BASE}/fotos`, { waitUntil: 'networkidle' })
  const before = await page.locator('img[src^="/uploads"]').count()

  await page.getByRole('button', { name: /Hochladen/ }).first().click()
  await page.locator('input[type=file]').setInputFiles(file)
  const submit = page.getByRole('button', { name: /hochladen$/i }).last()
  // Regression guard: resetting input.value used to empty the FileList before
  // React read it, leaving this button disabled forever.
  await submit.waitFor({ state: 'visible' })
  check(`${name}: Button aktiv`, await submit.isEnabled(), true)
  await submit.click()
  await page.waitForTimeout(5000)

  const shown = await page.locator('.text-destructive').allTextContents()
  const after = await page.locator('img[src^="/uploads"]').count()

  if (expectUpload) {
    check(`${name}: POST-Status`, status, 201)
    check(`${name}: Bild im Grid`, after, before + 1)
    check(`${name}: keine Fehlermeldung`, shown.length, 0)
  } else {
    check(`${name}: kein Request abgesetzt`, status, null)
    // The message carries the decoder errors, so match the stable prefix only.
    check(`${name}: erklärt sich`, (shown[0] ?? '').startsWith('Dieses Bild kann der Browser nicht lesen'), true)
    console.log(`        -> ${shown[0] ?? '(nichts)'}`)
  }
  check(`${name}: keine JS-Fehler`, errors.length, 0)
  await browser.close()
}

const { jpeg, heic } = fixtures()
console.log(`\nZiel: ${BASE}\n`)
console.log('WebKit (Safari)')
await upload(webkit, 'JPEG', jpeg, true)
await upload(webkit, 'HEIC', heic, true)
console.log('Chromium (kann HEIC nicht dekodieren)')
await upload(chromium, 'JPEG', jpeg, true)
await upload(chromium, 'HEIC', heic, false)

const sample = 'examples/IMG_7396.jpeg'
if (existsSync(sample)) {
  console.log('Mehrfach-Upload (echtes iPhone-Foto)')
  await uploadMany(sample)
} else {
  console.log(`Mehrfach-Upload übersprungen: ${sample} fehlt`)
}

console.log(failures === 0 ? '\nAlles grün.\n' : `\n${failures} Prüfung(en) fehlgeschlagen.\n`)
process.exit(failures === 0 ? 0 : 1)
