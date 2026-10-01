/**
 * Captures the screenshots the README shows.
 *
 * They are generated rather than taken by hand so they can be refreshed after
 * a UI change instead of quietly going stale -- re-run this whenever a screen
 * in the README looks different from the app.
 *
 *   bun run demo-data      # the data and the accounts the shots depend on
 *   bun run dev            # serves frontend/dist + the API on :3000
 *   bun run screenshots
 *
 * Most shots are of a signed-in member, because the dialogs they show are
 * members-only. The ones marked `as: 'guest'` and `as: 'visitor'` get their own
 * cookie-less contexts, so the README can also show what someone who has not
 * logged in sees and the login screen they land on first.
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
const USER = process.env.SHOT_USER ?? 'anna'
const PASSWORD = process.env.SHOT_PASSWORD ?? 'gartenzaun'

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
    // The legend, not the heading: it only renders once the rain query has
    // answered, so this cannot capture the calendar before it is coloured.
    ready: (page) => page.locator('[data-slot="slider"]').waitFor(),
  },
  {
    file: '03-giessen-eintragen.webp',
    path: `/waterPlants?date=${OPEN_DAY}`,
    // Same reason as above, plus the dialog: the calendar behind the sheet is
    // part of the shot.
    ready: async (page) => {
      await page.locator('[data-slot="slider"]').waitFor()
      await page.getByRole('dialog').waitFor()
    },
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
    file: '07-aufgaben.webp',
    path: '/aufgaben',
    ready: (page) => page.getByRole('button', { name: 'Neue Aufgabe' }).waitFor(),
  },
  {
    file: '08-aufgaben-verlauf.webp',
    path: '/aufgaben',
    prepare: (page) => page.getByRole('button', { name: 'Verlauf' }).click(),
    ready: (page) => page.getByRole('dialog').waitFor(),
    cropTo: '[role=dialog]',
  },
  {
    file: '09-nur-lesen.webp',
    path: '/aufgaben',
    // What a guest sees: the list in full, the buttons out of reach.
    as: 'guest',
    ready: (page) => page.getByText(/Nur zum Anschauen/).waitFor(),
  },
  {
    file: '10-anmelden.webp',
    path: '/login',
    // The first screen anyone meets, so it belongs in the README. Neither a
    // cookie nor the guest flag, which is what makes the gate redirect here.
    as: 'visitor',
    ready: (page) => page.getByRole('button', { name: 'Als Gast ansehen' }).waitFor(),
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
const contextOptions = {
  viewport: PHONE,
  deviceScaleFactor: 2, // 780px wide, just under GitHub's README column
  colorScheme: 'dark',
  reducedMotion: 'reduce', // the dialogs animate in; without this they are caught mid-fade
  locale: 'de-CH',
  timezoneId: 'Europe/Zurich', // pins both the Intl output and where "today" falls
}
const context = await browser.newContext(contextOptions)

/**
 * Signs in over plain fetch and hands the cookie to the context, rather than
 * using playwright's own request API: that one parses the response URL with
 * `new URL()` and under Bun it is handed a relative path, which throws.
 */
async function sessionCookie() {
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
  const [name, value] = res.headers.getSetCookie()[0].split(';')[0].split('=')
  return { name, value, url: BASE }
}

// One cookie signs in every page this context opens.
await context.addCookies([await sessionCookie()])

// Two contexts that never log in. The guest one carries the flag the login
// screen's button writes, which is what gets it past the gate in __root.tsx;
// the visitor one carries nothing, so it lands on the login screen itself.
const guestContext = await browser.newContext(contextOptions)
await guestContext.addInitScript(() => {
  try {
    localStorage.setItem('puent.guest', '1')
  } catch {
    // Matches the app's own handling -- a browser that refuses to store it
    // would simply bounce this context back to the login screen.
  }
})

const visitorContext = await browser.newContext(contextOptions)

const contexts = { guest: guestContext, visitor: visitorContext }

console.log(`Capturing ${shots.length} shots from ${BASE}`)

for (const { file, path, prepare, ready, cropTo, viewport, as } of shots) {
  const page = await (as ? contexts[as] : context).newPage()
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
