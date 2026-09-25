/**
 * Captures the screenshots the README shows.
 *
 * They are generated rather than taken by hand so they can be refreshed after
 * a UI change instead of quietly going stale -- re-run this whenever a screen
 * in the README looks different from the app.
 *
 *   bun run demo-data      # the data the shots depend on
 *   bun run dev            # serves frontend/dist + the API on :3000
 *   bun run screenshots
 *
 * Chromium, not the WebKit the e2e test uses: Safari is what the garden group
 * browses with, but Chromium is what rasterises deterministically and honours
 * deviceScaleFactor, which matters more when the output is committed for good.
 *
 * Every shot is phone-width. The layouts are capped at max-w-sm/md/2xl, so a
 * desktop capture is a thin column stranded in a wide black field -- and a
 * phone in a garden is where this app actually gets used.
 */
import { chromium } from 'playwright'
import sharp from 'sharp'
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const OUT = process.env.OUT ?? 'docs/screenshots'

/** An open day in the current month -- the deep link preselects it and opens the dialog. */
const OPEN_DAY = '2026-09-26'

const shots = [
  {
    file: '01-dashboard.webp',
    path: '/',
    // Waiting for the footer counter rules out capturing the "Loading..." state.
    ready: (page) => page.getByText(/von \d+ Tagen offen/).waitFor(),
  },
  {
    file: '02-giess-plan.webp',
    path: '/waterPlants',
    ready: (page) => page.getByRole('heading', { name: 'Giess-Plan' }).waitFor(),
  },
  {
    file: '03-giessen-eintragen.webp',
    path: `/waterPlants?date=${OPEN_DAY}`,
    ready: (page) => page.getByRole('dialog').waitFor(),
    // The overlay is fixed and 100dvh tall, so measuring the page would just
    // return the viewport. Crop to the sheet, keeping the calendar behind it.
    cropTo: '[role=dialog]',
  },
  {
    file: '04-fotos.webp',
    path: '/fotos',
    ready: (page) => page.getByRole('heading', { name: 'Fotos' }).waitFor(),
  },
  {
    file: '05-foto-upload.webp',
    path: '/fotos',
    prepare: (page) => page.getByRole('button', { name: /Hochladen/ }).first().click(),
    ready: (page) => page.getByText('Fotos hochladen').waitFor(),
    cropTo: '[role=dialog]',
  },
  {
    file: '06-ausgaben.webp',
    path: '/expenses',
    ready: (page) => page.getByRole('button', { name: 'Neuer Eintrag' }).waitFor(),
    // The one screen that is not a phone shot. Four columns plus a delete
    // button do not fit 390px: the date wraps to "14.3.20..." and the Actions
    // header runs off the edge. A table needs the width to be read at all.
    viewport: { width: 560, height: 844 },
  },
]

/**
 * Where the content actually ends. `fullPage` uses the scroll height, which on
 * these screens is a viewport-tall body with the cards floating at the top --
 * so a naive capture is half empty black.
 */
function contentBottom(page, selector) {
  return page.evaluate((sel) => {
    if (sel) {
      return Math.ceil(document.querySelector(sel).getBoundingClientRect().bottom + window.scrollY)
    }
    const bottoms = [...document.body.querySelectorAll('*')]
      .filter((el) => {
        const style = getComputedStyle(el)
        return style.position !== 'fixed' && style.visibility !== 'hidden'
      })
      .map((el) => {
        const box = el.getBoundingClientRect()
        return box.height > 0 ? box.bottom + window.scrollY : 0
      })
    return Math.ceil(Math.max(...bottoms))
  }, selector)
}

mkdirSync(OUT, { recursive: true })

const PHONE = { width: 390, height: 844 } // iPhone 14, logical pixels
const PAD = 12 // a little breathing room under the last element

// --lang is what a native <input type="date"> reads for its placeholder. The
// context locale alone leaves it as mm/dd/yyyy, which no Swiss phone shows.
const browser = await chromium.launch({ args: ['--lang=de-CH'] })
const context = await browser.newContext({
  viewport: PHONE,
  deviceScaleFactor: 2, // 780px wide, just under GitHub's README column
  colorScheme: 'dark',
  reducedMotion: 'reduce', // the dialogs animate in; without this they are caught mid-fade
  locale: 'de-CH',
  timezoneId: 'Europe/Zurich', // pins both the Intl output and where "today" falls
})

console.log(`Capturing ${shots.length} shots from ${BASE}`)

for (const { file, path, prepare, ready, cropTo, viewport } of shots) {
  const page = await context.newPage()
  if (viewport) await page.setViewportSize(viewport)
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })

  if (prepare) await prepare(page)
  await ready(page)

  // networkidle fires before the thumbnails have decoded, so the grid would
  // otherwise be captured as empty boxes.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('img[src^="/uploads"]')].every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
  )
  await page.evaluate(() => document.fonts.ready)

  const width = (viewport ?? PHONE).width
  const height = (await contentBottom(page, cropTo)) + PAD
  const png = await page.screenshot({
    fullPage: true,
    clip: { x: 0, y: 0, width, height },
    animations: 'disabled',
  })
  await page.close()

  // Committed for good, so the format matters: WebP is a third of the PNG
  // here, and two of these shots are mostly photographs. Same encoder the
  // server puts every upload through.
  const out = join(OUT, file)
  await sharp(png).webp({ quality: 90 }).toFile(out)

  const kb = Math.round(statSync(out).size / 1024)
  console.log(`  ${file}  ${width}x${height}  ${kb} KB`)
}

await browser.close()
console.log('\nDone. Look at every file before committing it.')
