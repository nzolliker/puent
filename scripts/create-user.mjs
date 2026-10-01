/**
 * Creates a gardener, or changes the e-mail address of one.
 *
 *   bun run create-user nicola "Nicola" nicola@example.ch
 *   bun run create-user nicola --email nicola@example.com
 *
 * The app has no login of its own. Cloudflare Access signs people in and tells
 * the app their e-mail address; an account here is what turns that address
 * into a gardener who can write, under the display name given.
 *
 * So there are two lists, and a new gardener has to be on both:
 *
 *   1. the Access policy, which decides who reaches the app at all
 *   2. this table, which decides who may change something once inside
 *
 * Somebody on the first list only is a guest: they see everything and can
 * enter nothing.
 *
 * Unlike demo-data, this is meant to run against production too -- on the Pi
 * that is `docker exec -it puent-app bun run create-user ...`.
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set -- see .env in the repo root.')
  process.exit(1)
}

const USAGE =
  'Usage: bun run create-user <username> "<display name>" <email>\n' +
  '       bun run create-user <username> --email <email>'

const args = process.argv.slice(2)
const flag = args.indexOf('--email')
const changeEmail = flag !== -1

const username = args[0]
const displayName = changeEmail ? undefined : args[1]
// Lowercase, because that is how the server compares it against the token.
const email = (changeEmail ? args[flag + 1] : args[2])?.trim().toLowerCase()

if (!username || username.startsWith('--')) {
  console.error(USAGE)
  process.exit(1)
}

if (!/^[a-z0-9_-]{3,60}$/.test(username)) {
  console.error('Username: 3-60 characters, lowercase letters, digits, - and _ only.')
  process.exit(1)
}

if (!changeEmail && !displayName) {
  console.error('A display name is required -- it is the name that shows up on a')
  console.error('watering day and on an expense. Use --email for an existing account.')
  process.exit(1)
}

// Not a full validation, only enough to catch the arguments in the wrong order.
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
  console.error('An e-mail address is required -- it is what Cloudflare Access')
  console.error('identifies the person by.\n')
  console.error(USAGE)
  process.exit(1)
}

const db = await mysql.createConnection(url)

try {
  const [existing] = await db.query('SELECT `id`, `name` FROM `users` WHERE `username` = ?', [username])
  const userId = existing[0]?.id

  const [taken] = await db.query('SELECT `username` FROM `users` WHERE `email` = ?', [email])
  if (taken[0] && taken[0].username !== username) {
    console.error(`${email} already belongs to "${taken[0].username}".`)
    process.exit(1)
  }

  if (changeEmail) {
    if (!userId) {
      console.error(`No account called "${username}". Drop --email to create one.`)
      process.exit(1)
    }
    await db.query('UPDATE `users` SET `email` = ? WHERE `id` = ?', [email, userId])
    console.log(`${existing[0].name} (${username}) is now ${email}`)
  } else if (userId) {
    console.error(`"${username}" already exists. Use --email to change the address.`)
    process.exit(1)
  } else {
    await db.query(
      'INSERT INTO `users` (`username`, `name`, `email`) VALUES (?, ?, ?)',
      [username, displayName, email],
    )
    console.log(`Created ${displayName} (${username}) as ${email}`)
  }

  console.log('\nThe same address has to be on the Cloudflare Access policy, or the')
  console.log('person never reaches the app: Zero Trust -> Access -> Applications.\n')
} finally {
  await db.end()
}
