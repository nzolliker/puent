/**
 * Creates a gardener, or resets one who forgot their password, and prints the
 * single-use link they open to choose a password themselves.
 *
 *   bun run create-user nicola "Nicola"
 *   bun run create-user nicola --reset
 *
 * There is no e-mail server anywhere in this project, so the link is the whole
 * delivery mechanism: copy it into the group chat. It is valid for seven days
 * and stops working the moment it is used. A reset also drops that account's
 * existing sessions, so whoever knew the old password is logged out.
 *
 * Unlike demo-data, this is meant to run against production too -- on the Pi
 * that is `docker exec -it puent-app bun run create-user ...`.
 */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import mysql from 'mysql2/promise'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set -- see .env in the repo root.')
  process.exit(1)
}

const args = process.argv.slice(2)
const reset = args.includes('--reset')
const [username, displayName] = args.filter((arg) => arg !== '--reset')

if (!username) {
  console.error('Usage: bun run create-user <username> "<display name>" [--reset]')
  process.exit(1)
}

if (!/^[a-z0-9_-]{3,60}$/.test(username)) {
  console.error('Username: 3-60 characters, lowercase letters, digits, - and _ only.')
  process.exit(1)
}

if (!reset && !displayName) {
  console.error('A display name is required -- it is the name that shows up on a')
  console.error('watering day and on an expense. Use --reset for an existing account.')
  process.exit(1)
}

// Same two helpers as server/lib/auth.ts: the raw token goes to the person,
// only its hash goes in the table.
function generateToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

const db = await mysql.createConnection(url)

try {
  const [existing] = await db.query('SELECT `id`, `name` FROM `users` WHERE `username` = ?', [username])
  let userId = existing[0]?.id

  if (reset) {
    if (!userId) {
      console.error(`No account called "${username}". Drop --reset to create one.`)
      process.exit(1)
    }
    console.log(`Resetting ${existing[0].name} (${username})`)
  } else if (userId) {
    console.error(`"${username}" already exists. Use --reset to send a new link.`)
    process.exit(1)
  } else {
    const [result] = await db.query(
      'INSERT INTO `users` (`username`, `name`) VALUES (?, ?)',
      [username, displayName],
    )
    userId = result.insertId
    console.log(`Created ${displayName} (${username})`)
  }

  const token = generateToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db.query(
    'INSERT INTO `setup_tokens` (`id`, `user_id`, `expires_at`) VALUES (?, ?, ?)',
    [hashToken(token), userId, expiresAt],
  )

  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')

  console.log('\nSend this link -- it works once, and expires in 7 days:\n')
  console.log(`  ${appUrl}/setup?token=${token}\n`)
} finally {
  await db.end()
}
