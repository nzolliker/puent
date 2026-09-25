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
 * This DELETES the rows in waterPlants, expenses and albums, so it refuses to
 * run against anything but a database on localhost. Photos are left alone --
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

/** Titles stay short on purpose: the table truncates the column at 150px. */
const EXPENSES = [
  ['Samen', '48.60', '2026-03-14'],
  ['Pflanzerde', '23.90', '2026-04-02'],
  ['Giesskanne', '19.80', '2026-04-19'],
  ['Kompost', '34.50', '2026-05-08'],
  ['Himbeeren', '56.00', '2026-06-11'],
  ['Schneckenzaun', '41.20', '2026-08-23'],
]

/**
 * Albums are matched to the photos that happen to be in uploads/, by caption.
 * A photo with no match stays under "Ohne Album" -- which is worth showing,
 * since that is the state most photos are in.
 */
const ALBUMS = [
  { name: 'Beet 1', captions: ['Jätte'] },
  { name: 'Pergola', captions: ['Pergola'] },
]

const db = await mysql.createConnection(url)

try {
  await db.query('DELETE FROM `waterPlants`')
  const water = [...WATER_WINDOW, ...WATER_HISTORY]
  await db.query('INSERT INTO `waterPlants` (`name`, `date`) VALUES ?', [water])
  console.log(`  waterPlants  ${water.length} rows (${WATER_WINDOW.length} in the dashboard window)`)

  await db.query('DELETE FROM `expenses`')
  await db.query('INSERT INTO `expenses` (`title`, `amount`, `date`) VALUES ?', [EXPENSES])
  const total = EXPENSES.reduce((sum, [, amount]) => sum + Number(amount), 0)
  console.log(`  expenses     ${EXPENSES.length} rows, ${total.toFixed(2)} CHF total`)

  // Photos outlive albums: the FK is ON DELETE SET NULL, so clearing the
  // albums table detaches the photos instead of deleting them.
  await db.query('DELETE FROM `albums`')
  for (const { name, captions } of ALBUMS) {
    const [{ insertId }] = await db.query('INSERT INTO `albums` (`name`) VALUES (?)', [name])
    const [result] = await db.query(
      'UPDATE `photos` SET `album_id` = ? WHERE `caption` IN (?)',
      [insertId, captions],
    )
    console.log(`  album        ${name} -- ${result.affectedRows} photo(s)`)
  }

  const [[{ photos }]] = await db.query('SELECT COUNT(*) AS photos FROM `photos`')
  if (photos === 0) {
    console.log('\n  Note: no photos in the database. Upload a few through /fotos --')
    console.log('  a photo row without its file in uploads/ renders as a broken image.')
  }

  console.log('\nDone.')
} finally {
  await db.end()
}
