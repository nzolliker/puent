/**
 * Fills a local database with demo content, so the app can be looked at --
 * and screenshotted -- without a season of real use behind it.
 *
 * The README screenshots are generated from exactly this data, which is why
 * this file is committed: re-running it reproduces them. It is also the
 * quickest way to see the app do something after a fresh `bun run db:migrate`,
 * where every screen would otherwise be an empty state.
 *
 *   bun run demo-data
 *
 * This DELETES the rows in waterPlants, expenses, todos, plantings, albums and
 * weatherDays, so it refuses to run against anything but a database on
 * localhost. Photos are left alone -- their rows point at files in uploads/
 * that this script cannot invent.
 *
 * It also creates the demo accounts below, because writing anything needs an
 * account. Existing accounts are updated rather than deleted, so an account
 * made by hand survives a re-run.
 *
 * weatherDays is a cache of MeteoSchweiz data rather than content, and it is
 * seeded only so the rain colours are the same every time the screenshots are
 * taken, and so the pages can be demoed with no network. The app refreshes it
 * from MeteoSchweiz within the hour, which replaces these values with the real
 * ones.
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'

import { bedCells } from '../server/garden/geometry.ts'
import { gardenLayout } from '../server/garden/layout.ts'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set -- see .env in the repo root.')
  process.exit(1)
}

// The script is destructive, so the guard is a hard stop rather than a prompt:
// the production database only ever answers to the Pi, never to localhost.
const { hostname, pathname } = new URL(url)
if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
  console.error(`Refusing to touch a non-local database (host: ${hostname}).`)
  console.error('This script deletes rows. Point DATABASE_URL at your dev container.')
  process.exit(1)
}

const database = pathname.replace(/^\//, '')
console.log(`Seeding ${database} on ${hostname}`)

/**
 * The watering rota. `/api/water-plants/overview?days=3` reads today +/- 3
 * days, so the dashboard strip only looks alive if this window is part-filled:
 * four days taken, three left open, which is also the more honest picture of a
 * rota nobody has finished signing up for.
 */
const WATER_WINDOW = [
  ['Anna', '2026-09-22'],
  ['Jonas', '2026-09-23'],
  ['Mira', '2026-09-25'],
  ['Leo', '2026-09-27'],
]

/** The rest of the month, so the calendar page is not four green days in a field of grey. */
const WATER_HISTORY = [
  ['Sofia', '2026-09-01'],
  ['Anna', '2026-09-03'],
  ['Jonas', '2026-09-07'],
  ['Mira', '2026-09-10'],
  ['Leo', '2026-09-14'],
  ['Sofia', '2026-09-17'],
  ['Anna', '2026-09-19'],
  ['Jonas', '2026-09-30'],
  ['Mira', '2026-10-02'],
  ['Leo', '2026-10-05'],
]

/** Titles stay short on purpose: the table truncates the column at 9rem. */
const EXPENSES = [
  ['Samen', '48.60', '2026-03-14', 'Nicola Zolliker'],
  ['Pflanzerde', '23.90', '2026-04-02', 'Anna Brunner'],
  ['Giesskanne', '19.80', '2026-04-19', 'Nicola Zolliker'],
  ['Kompost', '34.50', '2026-05-08', 'Tobias Meier'],
  ['Himbeeren', '56.00', '2026-06-11', 'Anna Brunner'],
  ['Schneckenzaun', '41.20', '2026-08-23', 'Tobias Meier'],
]

/**
 * The jobs that are not watering. A few left open so the page and the
 * dashboard card have something to show, and a few already done so the
 * Verlauf dialog is not an empty state in the screenshot.
 */
const TODOS_OPEN = [
  'Unkraut jäten Beet 2',
  'Zaun beim Kompost flicken',
  'Schneckenkörner nachfüllen',
  'Tomaten aufbinden',
]

/** Completed, newest last -- the history sorts on `completed_at` descending. */
const TODOS_DONE = [
  ['Laub vom Weg räumen', '2026-09-06 10:20:00'],
  ['Beet 1 mulchen', '2026-09-13 16:45:00'],
  ['Giesskanne ersetzen', '2026-09-21 09:05:00'],
]

/**
 * What grows where, and what was cleared away before it.
 *
 * Written against a bed's place in the layout and a share of its cells rather
 * than against keys and cell numbers, so the seed keeps working when
 * server/garden/layout.ts is redrawn. A bed the layout does not have, or a
 * share that rounds to no cell, is skipped.
 *
 * [bed, crop, from, to, planted, removed, note] -- `from` and `to` are
 * fractions of the bed's cells, and the ones still growing in one bed must not
 * overlap.
 */
const PLANTINGS = [
  [0, 'Tomaten', 0, 0.5, '2026-05-14', null, 'San Marzano'],
  [0, 'Basilikum', 0.5, 0.75, '2026-05-20', null, null],
  [0, 'Spinat', 0, 0.5, '2026-03-08', '2026-05-10', null],
  [0, 'Radieschen', 0.5, 1, '2026-03-22', '2026-05-16', 'Schnecken haben die Hälfte geholt'],
  [1, 'Salat', 0, 0.67, '2026-08-02', null, 'Lollo rosso'],
  [1, 'Erbsen', 0, 1, '2026-04-04', '2026-07-20', null],
  [2, 'Kürbis', 0, 1, '2026-05-25', null, null],
  [3, 'Salbei', 0, 0.25, '2025-04-12', null, null],
  [3, 'Schnittlauch', 0.25, 0.5, '2025-04-12', null, null],
  [4, 'Zucchetti', 0, 0.67, '2026-05-25', null, null],
]

/**
 * Albums are filled from whatever photos are in the database, newest first,
 * rather than matched on a caption -- captions change, and a seed that
 * silently assigns nothing is worse than no seed at all. Anything left over
 * stays under "Ohne Album", which is the state most photos are in anyway.
 */
const ALBUMS = [
  { name: 'Beet 1', photos: 2 },
  { name: 'Ernte', photos: 1 },
]

/**
 * Rainfall in millimetres, chosen so that the default threshold of 2 mm shows
 * every state the Giess-Plan can draw: a rain day nobody took (blue, "Regen"),
 * one that is taken (green and blue, split diagonally), and the same pair again
 * from the forecast in a lighter blue.
 *
 * `measured` is how a day that is over is published; `forecast` covers today
 * and the next seven days, which is the window the app keeps.
 */
const RAIN_MEASURED = [
  ['2026-09-02', 0.0],
  ['2026-09-08', 4.2],
  ['2026-09-09', 6.9],
  ['2026-09-13', 0.4],
  ['2026-09-16', 3.5],
  // Taken by Sofia above, so this is the diagonal in the screenshot.
  ['2026-09-17', 6.4],
  ['2026-09-20', 1.1],
  ['2026-09-24', 0.0],
  ['2026-09-26', 0.0],
  ['2026-09-28', 0.0],
]

const RAIN_FORECAST = [
  ['2026-09-29', 0.0],
  ['2026-09-30', 0.6],
  ['2026-10-01', 2.8],
  // Taken by Mira above: the forecast diagonal.
  ['2026-10-02', 4.0],
  ['2026-10-03', 0.0],
  ['2026-10-04', 0.2],
  ['2026-10-05', 7.1],
  ['2026-10-06', 1.4],
]

/** Describe the sample photos, applied newest first where one is missing. */
const CAPTIONS = ['Salat und Kabis', 'Kohlrabi', 'Ernte']

/**
 * The accounts the screenshot and e2e scripts act as. The display names match
 * the `created_by` values above on purpose: the expenses can then be joined
 * back onto a real account, which is what the accounts are for.
 *
 * Nobody signs in locally. With AUTH_DEV_BYPASS=true the server takes the
 * address from the `x-dev-email` header, or from DEV_USER_EMAIL, and one of
 * the addresses below is what makes that request a member.
 *
 * The watering rows are deliberately left unattached. They stand in for the
 * season that predates the accounts, and they are what keeps the "name kept
 * alongside user_id" path honest -- the calendar still has to render them.
 */
const DEMO_USERS = [
  ['anna', 'Anna Brunner', 'anna@example.com'],
  ['nicola', 'Nicola Zolliker', 'nicola@example.com'],
  ['tobias', 'Tobias Meier', 'tobias@example.com'],
]

const db = await mysql.createConnection(url)

try {
  // Upsert rather than replace: a local database may also hold an account that
  // was created by hand, and this script has no business resetting it.
  for (const [username, name, email] of DEMO_USERS) {
    await db.query(
      'INSERT INTO `users` (`username`, `name`, `email`) VALUES (?, ?, ?) ' +
        'ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `email` = VALUES(`email`)',
      [username, name, email],
    )
  }
  console.log(`  users        ${DEMO_USERS.length} demo accounts, <username>@example.com`)

  await db.query('DELETE FROM `waterPlants`')
  const water = [...WATER_WINDOW, ...WATER_HISTORY]
  await db.query('INSERT INTO `waterPlants` (`name`, `date`) VALUES ?', [water])
  console.log(`  waterPlants  ${water.length} rows (${WATER_WINDOW.length} in the dashboard window)`)

  await db.query('DELETE FROM `expenses`')
  await db.query(
    'INSERT INTO `expenses` (`title`, `amount`, `date`, `created_by`) VALUES ?',
    [EXPENSES],
  )
  // What the POST route now does for every new expense, applied to the seed.
  const [attached] = await db.query(
    'UPDATE `expenses` e JOIN `users` u ON u.`name` = e.`created_by` SET e.`user_id` = u.`id`',
  )
  const total = EXPENSES.reduce((sum, [, amount]) => sum + Number(amount), 0)
  console.log(`  expenses     ${EXPENSES.length} rows, ${total.toFixed(2)} CHF total, ${attached.affectedRows} linked to an account`)

  await db.query('DELETE FROM `todos`')
  const todos = [
    ...TODOS_OPEN.map((title) => [title, null]),
    ...TODOS_DONE,
  ]
  await db.query('INSERT INTO `todos` (`title`, `completed_at`) VALUES ?', [todos])
  console.log(`  todos        ${todos.length} rows (${TODOS_OPEN.length} still open)`)

  await db.query('DELETE FROM `plantings`')
  const plantings = PLANTINGS.flatMap(([bedIndex, crop, from, to, plantedAt, removedAt, note]) => {
    const bed = gardenLayout.beds[bedIndex]
    if (!bed) return []

    const cells = bedCells(bed).map((cell) => cell.index)
    // The same rounding at both ends, so two shares that meet at 0.5 never
    // claim the same cell.
    const share = cells.slice(Math.round(from * cells.length), Math.round(to * cells.length))
    if (share.length === 0) return []

    return [[bed.key, JSON.stringify(share), crop, note, plantedAt, removedAt, 'Anna Brunner']]
  })
  if (plantings.length > 0) {
    await db.query(
      'INSERT INTO `plantings` (`bed_key`, `cells`, `crop`, `note`, `planted_at`, `removed_at`, `created_by`) VALUES ?',
      [plantings],
    )
    await db.query(
      'UPDATE `plantings` p JOIN `users` u ON u.`name` = p.`created_by` SET p.`user_id` = u.`id`',
    )
  }
  const growing = plantings.filter(([, , , , , removedAt]) => removedAt === null).length
  console.log(`  plantings    ${plantings.length} rows (${growing} still growing)`)

  await db.query('DELETE FROM `weatherDays`')
  const rain = [
    ...RAIN_MEASURED.map(([date, mm]) => [date, mm, 'measured']),
    ...RAIN_FORECAST.map(([date, mm]) => [date, mm, 'forecast']),
  ]
  // fetched_at is left to the column default, which is the database's own
  // now(). Passing a JS Date here instead writes the local wall time, which
  // MySQL then compares against a UTC now() -- the freshness age comes out
  // negative and the app stops refreshing for as long as the offset.
  await db.query(
    'INSERT INTO `weatherDays` (`date`, `precip_mm`, `source`) VALUES ?',
    [rain],
  )
  const rainy = rain.filter(([, mm]) => mm >= 2).length
  console.log(`  weatherDays  ${rain.length} rows (${rainy} above the 2 mm default)`)

  // Photos outlive albums: the FK is ON DELETE SET NULL, so clearing the
  // albums table detaches the photos instead of deleting them.
  await db.query('DELETE FROM `albums`')
  const [rows] = await db.query(
    'SELECT `id` FROM `photos` ORDER BY `created_at` DESC, `id` DESC',
  )
  const ids = rows.map((row) => row.id)

  let taken = 0
  for (const { name, photos } of ALBUMS) {
    const [{ insertId }] = await db.query('INSERT INTO `albums` (`name`) VALUES (?)', [name])
    const slice = ids.slice(taken, taken + photos)
    taken += slice.length
    if (slice.length > 0) {
      await db.query('UPDATE `photos` SET `album_id` = ? WHERE `id` IN (?)', [insertId, slice])
    }
    console.log(`  album        ${name} -- ${slice.length} photo(s)`)
  }

  // COALESCE so a photo that was captioned by hand keeps what it was given.
  for (const [index, id] of ids.entries()) {
    if (!CAPTIONS[index]) continue
    await db.query(
      'UPDATE `photos` SET `caption` = COALESCE(`caption`, ?) WHERE `id` = ?',
      [CAPTIONS[index], id],
    )
  }

  if (ids.length === 0) {
    console.log('\n  Note: no photos in the database. Upload a few through /fotos --')
    console.log('  a photo row without its file in uploads/ renders as a broken image.')
  } else {
    console.log(`  photos       ${ids.length} found, ${ids.length - taken} left under "Ohne Album"`)
  }

  console.log('\nDone.')
} finally {
  await db.end()
}
