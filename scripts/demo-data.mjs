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
 * This DELETES the rows in waterPlants, expenses, todos and albums, so it refuses
 * to run against anything but a database on localhost. Photos are left alone --
 * their rows point at files in uploads/ that this script cannot invent.
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'

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
 * Albums are filled from whatever photos are in the database, newest first,
 * rather than matched on a caption -- captions change, and a seed that
 * silently assigns nothing is worse than no seed at all. Anything left over
 * stays under "Ohne Album", which is the state most photos are in anyway.
 */
const ALBUMS = [
  { name: 'Beet 1', photos: 2 },
  { name: 'Ernte', photos: 1 },
]

/** Describe the sample photos, applied newest first where one is missing. */
const CAPTIONS = ['Salat und Kabis', 'Kohlrabi', 'Ernte']

const db = await mysql.createConnection(url)

try {
  await db.query('DELETE FROM `waterPlants`')
  const water = [...WATER_WINDOW, ...WATER_HISTORY]
  await db.query('INSERT INTO `waterPlants` (`name`, `date`) VALUES ?', [water])
  console.log(`  waterPlants  ${water.length} rows (${WATER_WINDOW.length} in the dashboard window)`)

  await db.query('DELETE FROM `expenses`')
  await db.query(
    'INSERT INTO `expenses` (`title`, `amount`, `date`, `created_by`) VALUES ?',
    [EXPENSES],
  )
  const total = EXPENSES.reduce((sum, [, amount]) => sum + Number(amount), 0)
  console.log(`  expenses     ${EXPENSES.length} rows, ${total.toFixed(2)} CHF total`)

  await db.query('DELETE FROM `todos`')
  const todos = [
    ...TODOS_OPEN.map((title) => [title, null]),
    ...TODOS_DONE,
  ]
  await db.query('INSERT INTO `todos` (`title`, `completed_at`) VALUES ?', [todos])
  console.log(`  todos        ${todos.length} rows (${TODOS_OPEN.length} still open)`)

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
