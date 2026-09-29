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
 * Uploading and deleting are members-only, so this signs in first. The account
 * is one of the demo ones -- run `bun run demo-data` if the login fails.
 *
 * WebKit stands in for Safari, which is what the garden group uses.
 */
import { webkit, chromium } from 'playwright'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const USER = process.env.E2E_USER ?? 'anna'
const PASSWORD = process.env.E2E_PASSWORD ?? 'gartenzaun'
const dir = mkdtempSync(join(tmpdir(), 'puent-e2e-'))
let failures = 0

/** The session cookie for the plain `fetch` calls in cleanup(). */
let apiCookie = ''

/** The cookie itself, added to each browser context before it navigates. */
let sessionCookie = null

/**
 * Signs in over plain fetch rather than playwright's request API: that one
 * parses the response URL with `new URL()` and under Bun it is handed a
 * relative path, which throws.
 */
async function loginForApi() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASSWORD }),
  })
  if (!res.ok) {
    throw new Error(
      `Login als "${USER}" fehlgeschlagen (${res.status}). bun run demo-data?`,
    )
  }
  apiCookie = res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')

  const [name, value] = apiCookie.split('=')
  sessionCookie = { name, value, url: BASE }
}

async function login(page) {
  await page.context().addCookies([sessionCookie])
}

/**
 * Every id this run uploaded, removed again at the end.
 *
 * The test drives the real app against the real database, so without this the
 * nine photos a run creates stay there -- and since `bun run demo-data`
 * deliberately leaves photos alone, nothing else ever clears them. A few runs
 * and the gallery is copies of the two fixtures.
 */
const uploaded = []

/** The reads still in flight, so a crash mid-run still cleans up what it made. */
const pending = []

/** Collects the ids out of a POST /api/photos response, for the cleanup. */
function collect(response) {
  const read = response
    .json()
    .then((body) => {
      for (const photo of body?.photos ?? []) uploaded.push(photo.id)
    })
    .catch(() => {})

  pending.push(read)
  return read
}

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
  const bodies = []
  page.on('response', (r) => {
    if (r.url().includes('/api/photos') && r.request().method() === 'POST') {
      status = r.status()
      bodies.push(collect(r))
    }
  })
  await login(page)
  await page.goto(`${BASE}/fotos`, { waitUntil: 'networkidle' })
  const before = await page.locator('img[src^="/uploads"]').count()
  await page.getByRole('button', { name: /Hochladen/ }).first().click()
  await page.locator('input[type=file]').setInputFiles(Array(copies).fill(file))
  await page.getByRole('button', { name: /hochladen$/i }).last().click()
  await page.waitForTimeout(30000)
  check(`${copies} grosse Fotos: POST-Status`, status, 201)
  check(`${copies} grosse Fotos: alle im Grid`, await page.locator('img[src^="/uploads"]').count(), before + copies)
  await Promise.all(bodies)
  await browser.close()
}

async function upload(browserType, name, file, expectUpload) {
  const browser = await browserType.launch()
  const page = await browser.newPage()
  let status = null
  const errors = []
  const bodies = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => {
    if (r.url().includes('/api/photos') && r.request().method() === 'POST') {
      status = r.status()
      bodies.push(collect(r))
    }
  })

  await login(page)
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
  await Promise.all(bodies)
  await browser.close()
}

/**
 * Puts the database back. DELETE /api/photos/:id removes both WebP files with
 * the row, so this is the same cleanup a person clicking the bin would do.
 *
 * In a `finally`, because a failed check is exactly when the leftovers are
 * least welcome: the next run would start against a gallery full of fixtures.
 */
async function cleanup() {
  // A throw can land between the upload and the response body being read.
  await Promise.allSettled(pending)
  if (uploaded.length === 0) return

  let removed = 0
  for (const id of uploaded) {
    const res = await fetch(`${BASE}/api/photos/${id}`, {
      method: 'DELETE',
      headers: { cookie: apiCookie },
    })
    if (res.ok) removed++
  }

  const leaked = uploaded.length - removed
  console.log(
    `\nAufgeräumt: ${removed} Test-Foto(s) gelöscht` +
      (leaked ? ` -- ${leaked} nicht, bitte in /fotos nachsehen` : ''),
  )
}

const { jpeg, heic } = fixtures()
console.log(`\nZiel: ${BASE}\n`)

await loginForApi()

try {
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
} finally {
  await cleanup()
}

console.log(failures === 0 ? '\nAlles grün.\n' : `\n${failures} Prüfung(en) fehlgeschlagen.\n`)
process.exit(failures === 0 ? 0 : 1)
