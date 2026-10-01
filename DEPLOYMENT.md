# Deployment Runbook

## Deploying A Change

Once the change is merged into `main` on GitHub, on the Pi:

```bash
cd /home/nzolliker/repos/puent
./scripts/deploy.sh
```

Or from the MacBook in one line:

```bash
ssh nzolliker@<pi-host> 'cd ~/repos/puent && ./scripts/deploy.sh'
```

The script stops at the first step that fails and says which. In order, it:

1. **Checks the configuration, before it changes anything.** `.env.production`
   has to exist and hold `DATABASE_URL`, `CF_ACCESS_TEAM_DOMAIN`,
   `CF_ACCESS_AUD` and `TUNNEL_TOKEN`; `AUTH_DEV_BYPASS` must not be in it; the
   checkout has to be on `main` with no modified tracked files.
2. **Pulls `main`** and lists the commits that came in.
3. **Dumps the database** to `~/puent-backups/puent-<timestamp>.sql.gz` and keeps
   the newest ten. Photos are not part of it, see
   [Persistent Data Warning](#persistent-data-warning).
4. **Builds the app image.**
5. **Runs the migrations with the new image, while the old version is still
   serving.** If a migration fails, the deploy stops here and the old version
   keeps running.
6. **Switches over** with `docker compose up -d` for the whole stack, so a change
   to `docker-compose.yml` is picked up too.
7. **Checks the result**: the app answers `403` on `localhost:3000` (up, and
   refusing a request without an Access token) and `cloudflared` is running. A
   `200` fails the check on purpose — it would mean the app serves everyone.
8. **Removes superseded images**, which otherwise pile up on the SD card.

Running it again without a new commit is fine: it rebuilds and restarts, which
is also how a change to `.env.production` takes effect.

To restore a dump:

```bash
gunzip -c ~/puent-backups/puent-<timestamp>.sql.gz | \
  docker exec -i puent-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot "$MYSQL_DATABASE"'
```

The sections below describe the same steps by hand. They are what to fall back
on when the script stops, and the explanation of what it does.

## Goal

This project runs in two clearly separated environments:

- Development: local machine, local source code, development-only database
- Production: Raspberry Pi, production Git checkout, production-only MySQL container

The point of this setup is to keep development and production isolated while still using a simple manual deployment workflow that is easy to understand.

## Production Architecture

The Raspberry Pi runs one Docker Compose stack with three services:

- `app`: the Bun server, which serves the built frontend and the API
- `mysql`: the production MySQL database
- `cloudflared`: the Cloudflare Tunnel connector, the only way in from outside
  (see [Access From Outside](#access-from-outside))

Conceptually:

1. The React frontend is built into `frontend/dist`.
2. The Bun server serves those static files for the browser.
3. The Bun server also handles API routes under `/api`.
4. The Bun server connects to MySQL using `DATABASE_URL`.
5. MySQL stores its actual data in a persistent Docker volume.

Important separation:

- The MacBook MySQL container is development-only.
- The Raspberry Pi MySQL container is production-only.
- Even if both use the same MySQL image family, they are different containers with different data and credentials.

## Host vs Container vs Volume

This setup only makes sense if you keep these three layers distinct.

### Host

The host is the Raspberry Pi itself.

Example host path:

```text
/home/nzolliker/repos/puent
```

This is where the production Git checkout lives.

### Container

The container is the isolated runtime environment created by Docker.

Example container path:

```text
/app
```

Inside the app container, the project files are copied into `/app`. That is why the Dockerfile uses:

```dockerfile
WORKDIR /app
COPY . .
```

### Volume

The volume is Docker-managed persistent storage.

There are two of them:

| Compose volume | Mounted at | Contains |
| --- | --- | --- |
| `puent_mysql_data` | `/var/lib/mysql` (mysql container) | the production database files |
| `puent_uploads` | `/app/uploads` (app container) | uploaded photos, as WebP |

This is where the production database files and the uploaded photos live.
Rebuilding the app image does not remove either.

The photo volume matters as much as the database one: without it, photos would
sit in the app container's writable layer and every `docker compose build app`
would delete them.

## Important Files

### `Dockerfile`

Builds the production app image. It:

- installs backend dependencies
- installs frontend dependencies
- copies the app source code
- builds the frontend into `frontend/dist`
- starts the Bun server

### `docker-compose.yml`

Defines the production stack:

- app service
- mysql service
- ports
- environment variables
- persistent MySQL volume
- the compose project name (`name: puent`), which also prefixes the volume name

### `.env.production`

Production-only environment file on the Raspberry Pi.

It is intentionally not committed to Git.

It contains values such as:

- `NODE_ENV=production`
- `PORT=3000`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `DATABASE_URL`
- `UPLOAD_DIR=/app/uploads`
- `RAIN_THRESHOLD_MM=2` (optional)
- `CF_ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com`
- `CF_ACCESS_AUD=<AUD tag of the Access application>`
- `TUNNEL_TOKEN=<token from the Cloudflare dashboard>`

`UPLOAD_DIR` has to be set here because `docker-compose.yml` lists the app's
environment variables explicitly rather than passing the whole file through.
It must point at the mount path of the `uploads` volume. The same applies to
the two `CF_ACCESS_*` variables: adding them to this file only, without also
adding them to the `app.environment:` block, silently does nothing.

`CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are what the app checks every
request's Access token against: that it was signed by this team, and issued for
this application. The team domain is under Zero Trust → Settings; the AUD tag is
on the Access application's overview page. Neither is a secret. Without both
the server refuses to start, which is deliberate — the alternative would be an
app that serves everyone when a line goes missing from this file.

`AUTH_DEV_BYPASS` must never appear in this file. It makes the server believe a
plain request header, and exists for local development only. The server refuses
to start if it is set next to the `CF_ACCESS_*` pair.

`TUNNEL_TOKEN` is what lets `cloudflared` attach to the tunnel. Treat it like a
password: whoever has it can serve the public hostname from their own machine.
If it leaks, rotate it in the dashboard (Networks → Tunnels → the tunnel →
refresh token) and update this file.

`RAIN_THRESHOLD_MM` is how many millimetres of rain make a day count as a rain
day in the Giess-Plan. It can be left out — `docker-compose.yml` falls back to
`2` — but do not set it to an empty value, which would count every day as rainy.

### Outbound network

The app fetches rainfall for Winterthur from MeteoSchweiz open data
(`data.geo.admin.ch`) and caches it in the `weatherDays` table. At most two
requests an hour, a few hundred kilobytes each.

It is the only outbound call the app makes, and it is not load-bearing: if
`data.geo.admin.ch` cannot be reached, the Giess-Plan and the dashboard serve
the rain data already in the table, or none at all, and keep working. A failed
refresh logs one line and is not retried for five minutes.

### `drizzle.config.ts`

Tells Drizzle:

- where the migration files are
- that the dialect is MySQL
- to read the target database from `DATABASE_URL`

## Access From Outside

Nothing on the router is opened. The app leaves the home network through a
Cloudflare Tunnel, and Cloudflare Access decides who may reach it at all.

```text
phone ──HTTPS──> Cloudflare ──Access check──> tunnel ──> cloudflared ──HTTP──> app:3000
```

- **Tunnel.** `cloudflared` dials out from the Pi to Cloudflare and keeps that
  connection open. The public hostname and its target (`http://app:3000`, the
  Compose service name) are set in the dashboard under Networks → Tunnels, not
  in this repo.
- **Access.** A self-hosted Access application covers the same hostname. Its
  policy is a list of e-mail addresses; anyone else is turned away by
  Cloudflare and never reaches the Pi. People sign in with a one-time code sent
  to their address.
- **The app** has no login of its own. Access attaches a signed token to every
  request it lets through (`Cf-Access-Jwt-Assertion`); the app verifies it and
  takes the e-mail address in it as who is asking. A request without a valid
  token gets `403` for everything, the frontend and the photos included.

Two rules that keep this safe:

1. The tunnel's public hostname and the Access application's hostname must be
   identical. A tunnel hostname that Access does not cover is public to the
   whole internet.
2. Port 3000 stays bound to `127.0.0.1`. The app would still refuse a LAN
   request, since it carries no token, but there is no reason to offer the port.

Sessions are Cloudflare's. How long somebody stays signed in is the session
duration on the Access application, and separately the global session timeout
under Zero Trust → Settings → Authentication, which defaults to 24 hours.

### Letting someone in

1. Add their e-mail address to the Access policy (Zero Trust → Access →
   Applications → the app → Policies).
2. Create their account under the same address, see [Accounts](#accounts).
   Skip this for somebody who should only look.

### Checking it

From a phone on mobile data, not the home WiFi:

- the hostname shows the Cloudflare sign-in page, then the app itself, with the
  person's first name in the top right — or "Gast" for an address without an
  account
- an address that is not on the policy does not get in

From any machine:

```bash
# 302 to <team>.cloudflareaccess.com, and no data in the body
curl -sI https://<your-hostname>/api/expenses

# refused: the port is not on the LAN
curl -i http://<pi-ip>:3000/
```

On the Pi:

```bash
docker logs puent-cloudflared --tail 20   # "Registered tunnel connection" x4
```

## Why `DATABASE_URL` Matters

The app and migrations both use `DATABASE_URL`.

Example shape:

```dotenv
DATABASE_URL=mysql://puent_app:YOUR_PASSWORD@mysql:3306/puent_prod
```

Meaning:

- user: `puent_app`
- password: `YOUR_PASSWORD`
- host: `mysql`
- port: `3306`
- database: `puent_prod`

Why host is `mysql` and not `localhost`:

- inside the app container, `localhost` means the app container itself
- `mysql` is the Compose service name
- Docker Compose provides internal DNS so the app container can resolve `mysql` to the MySQL container

## Why Migrations Work Inside the App Container

When you run:

```bash
docker exec -it puent-app bunx drizzle-kit migrate
```

that is enough because the app container already has:

- Bun
- the project source code
- the `drizzle/` migration files
- `drizzle.config.ts`
- the production `DATABASE_URL`
- network access to the `mysql` service

So Drizzle can connect to the production MySQL container and apply the SQL migration files to `puent_prod`.

## Daily Operations

All commands below assume you are on the Raspberry Pi in the production checkout:

```bash
cd /home/nzolliker/repos/puent
```

## Start The Production Stack

Use this when the containers are stopped and you want to bring production up.

```bash
docker compose --env-file .env.production up -d
```

What this does:

- starts MySQL
- starts the app
- starts `cloudflared`, which connects the public hostname to the app
- creates the network if needed
- creates the MySQL volume if needed

Verify:

```bash
docker compose --env-file .env.production ps
docker logs puent-mysql --tail 50
docker logs puent-app --tail 50
```

## Stop The Production Stack

Use this when you want to stop the running containers without deleting the database volume.

```bash
docker compose --env-file .env.production down
```

What this does:

- stops and removes the app container
- stops and removes the MySQL container
- keeps the named volume by default

Important:

- `down` does not remove MySQL data unless you explicitly add `-v`
- do not run `docker compose down -v` unless you intentionally want to destroy production DB data

## Restart The Production Stack

If you only want to bounce the services:

```bash
docker compose --env-file .env.production restart
```

If you changed images, Dockerfile, or Compose config, the safer pattern is:

```bash
docker compose --env-file .env.production down
docker compose --env-file .env.production up -d
```

## Inspect Logs

Useful commands:

```bash
docker logs puent-app --tail 100
docker logs puent-mysql --tail 100
```

Follow logs live:

```bash
docker logs -f puent-app
docker logs -f puent-mysql
```

Compose-level view:

```bash
docker compose --env-file .env.production ps
```

## Check The Running App

On the Pi:

```bash
curl -i http://localhost:3000/
```

The answer is `403 Forbidden`, and that is the healthy one: the server is up and
refuses a request that carries no Access token. There is no way to get a `200`
out of it from the Pi itself — open the public hostname in a browser for that.
No answer at all means the container is down; `docker logs puent-app` says why.
A server that exits right after starting with "No identity source configured"
is missing `CF_ACCESS_TEAM_DOMAIN` or `CF_ACCESS_AUD`.

From another machine the port does not answer at all: it is bound to loopback,
and the only way in is the public hostname, see
[Access From Outside](#access-from-outside).

## Run Migrations Against Production

Run migrations from inside the app container:

```bash
docker exec -it puent-app bunx drizzle-kit migrate
```

Use this when:

- production DB was just created
- a new app version includes new migrations

Why this approach is good:

- no Bun installation required on the Pi host
- migrations run in the same environment as the production app

Verify after migration:

```bash
docker logs puent-app --tail 50
```

and open the public hostname in a browser. `curl` on the Pi cannot check this:
without an Access token every path answers `403`, migrated or not.

## Accounts

The app has no login and stores no passwords. Cloudflare Access signs a person
in and hands the app their e-mail address in a signed token; the app looks that
address up in `users`.

That makes two lists, and a gardener has to be on both:

| List | Where | Decides |
| --- | --- | --- |
| Access policy | Zero Trust → Access → Applications → the app → Policies | who reaches the app at all |
| `users` table | `bun run create-user` | who may change something, and under which name |

Somebody on the Access policy only is a guest: they see everything and can
enter nothing. The page tells them which address they came in with.

Create an account from inside the container:

```bash
docker exec -it puent-app bun run create-user nicola "Nicola" nicola@example.ch
```

Change the address of an existing one:

```bash
docker exec -it puent-app bun run create-user nicola --email nicola@example.com
```

The address has to be the one the person types on the Cloudflare sign-in page.
Upper and lower case do not matter.

To take somebody's access away, remove the address from the Access policy —
that is the list that keeps people out. A session they already have stays valid
until it expires, so for an immediate cut also use "Revoke existing tokens" on
the application. Deleting the row in `users` only turns them into a guest.

## Build The App Image

Build only the app service:

```bash
docker compose --env-file .env.production build app
```

This rebuilds the image from the current production Git checkout on the Pi.

Re-running this command is normal. Docker reuses cached layers where possible and rebuilds changed parts.

## Manual Deploy / Update Workflow From Git

This is the recommended simple workflow when you have developed a new version locally and pushed it to Git.

### 1. Push your changes from your MacBook

Typical example:

```bash
git add .
git commit -m "Describe the change"
git push
```

### 2. SSH into the Raspberry Pi

```bash
ssh nzolliker@<pi-ip>
cd /home/nzolliker/repos/puent
```

### 3. Pull the new version

```bash
git status
git pull
```

Use `git status` first so you know whether the production checkout is clean before updating.

### 4. Rebuild the app image

```bash
docker compose --env-file .env.production build app
```

### 5. Restart the app with the new image

If only app code changed and MySQL config did not change:

```bash
docker compose --env-file .env.production up -d app
```

If you want the whole stack refreshed:

```bash
docker compose --env-file .env.production up -d
```

If Compose says the app needs recreation, that is expected.

### 6. Run migrations if the new version includes schema changes

```bash
docker exec -it puent-app bunx drizzle-kit migrate
```

This step matters whenever the new app version depends on new or changed tables/columns.

### 7. Verify the deployment

```bash
docker compose --env-file .env.production ps
docker logs puent-app --tail 100
curl -i http://localhost:3000/    # 403 is right: up, and guarded
```

## Recommended Deployment Order

This is the order `scripts/deploy.sh` uses, and the one to follow by hand:

1. `git pull`
2. `docker compose --env-file .env.production build app`
3. `docker compose --env-file .env.production run --rm -T app bunx drizzle-kit migrate`
4. `docker compose --env-file .env.production up -d`
5. verify with logs and `curl`

Migrating comes before switching over, with a one-off container from the image
that was just built:

- a migration that fails stops the deploy while the old version is still
  serving, instead of leaving new code on a half-migrated database
- the new code never runs against a schema it does not know yet

The price is the few seconds in which the old code runs against the new schema.
That is harmless for a migration that only adds things, and worth a thought for
one that drops a column the old code still reads.

## One-Time Migration: Project Moved To Repo Root

**Done on 2026-09-24, together with the photo-upload deploy.** Kept here as a record of
what the move involved; there is nothing left to run. Two things were easy to miss and are
worth knowing if a similar move ever happens again:

- The Git checkout had already been pulled to the new layout months earlier, but the
  *running stack* was still the old Compose project. Nothing about `git status` or the app
  being up hinted at that — only `docker inspect` on the container showed the old
  `com.docker.compose.project` label and the `big-tutorial-2024_mysql_data` mount.
- `.env.production` is gitignored, so `git pull` left it behind in the old directory while
  every tracked file moved to the root. Compose then found no env file at the new path.
  Starting the new stack at that point would have run MySQL with empty credentials against
  a fresh, empty volume.

The project used to live in `sam-tutorial/big-tutorial-2024/` inside the repo. It now sits at
the repo root (`/home/nzolliker/repos/puent`), and the other tutorials moved to `tutorials/`.

Compose derives its project name from the directory, so the stack was renamed from
`big-tutorial-2024` to `puent`. The name is now pinned explicitly in `docker-compose.yml`
(`name: puent`) so it no longer depends on the folder name.

The MySQL volume is named after the project, so the existing `big-tutorial-2024_mysql_data`
volume has to be copied over once. Do this on the Pi, in this order:

```bash
# 1. stop the OLD stack, BEFORE pulling.
#    `docker compose down` from the old path only works while its
#    docker-compose.yml is still there. Once the pull has moved it, stop the
#    containers by name instead -- named volumes survive `rm`:
docker stop puent-app puent-mysql && docker rm puent-app puent-mysql

# 2. pull the new layout
cd /home/nzolliker/repos/puent
git pull

# 2b. carry the production env file over -- it is gitignored, so the pull
#     leaves it in the old directory
cp -p sam-tutorial/big-tutorial-2024/.env.production .env.production
echo 'UPLOAD_DIR=/app/uploads' >> .env.production

# 3. copy the database volume to its new name
docker volume create puent_mysql_data
docker run --rm \
  -v big-tutorial-2024_mysql_data:/from \
  -v puent_mysql_data:/to \
  alpine sh -c "cd /from && cp -a . /to"

# 4. start the renamed stack and verify the data is there
docker compose up -d
docker compose logs -f app
```

Compose warns that `puent_mysql_data` "already exists but was not created by Docker
Compose". That is expected here -- it means it is using the volume the copy just filled,
which is the whole point.

Keep `big-tutorial-2024_mysql_data` around until you have confirmed the app sees the old data.
As of 2026-09-24 it is confirmed and the old volume is still present, so it can be removed
whenever you want the space back:

```bash
docker volume rm big-tutorial-2024_mysql_data
```

## Persistent Data Warning

Production MySQL data and uploaded photos are stored in Docker volumes, not in
Git.

That means:

- `git pull` does not affect production DB data or photos
- rebuilding the app image does not affect production DB data or photos
- restarting containers does not affect production DB data or photos

But:

- `docker compose down -v`
- `docker volume rm ...`

can destroy the production database **and every uploaded photo** if used
carelessly.

The database is dumped to `~/puent-backups` by every run of `scripts/deploy.sh`,
which keeps the newest ten. That is a safety net for a migration, not a backup:
it sits on the same SD card as the database, and nothing takes one between
deploys.

The photos are not backed up at all. They are the one kind of data here that
cannot be recreated by re-entering it, so a copy is worth taking:

```bash
docker run --rm -v puent_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

## What Is Safe To Recreate

Usually safe to recreate:

- the app container
- the app image

Be careful with:

- the MySQL container, because it depends on persistent data

Critical:

- the named MySQL volume contains the production database state

## Current Production Assumptions

This runbook assumes:

- the app is published on `127.0.0.1:3000`, reachable on the Pi but not from the LAN
- the outside world reaches it only through the Cloudflare Tunnel, behind Access
- MySQL is published on `127.0.0.1:3306`, reachable on the Pi but not from the LAN
- the Bun server serves static files from `frontend/dist`
- the API lives under `/api`
- Drizzle migrations are in `drizzle/`
- production env vars are stored in `.env.production`

## Possible Later Improvements

This setup is intentionally simple. Later improvements could include:

- running the app container as a non-root user
- backing up the database and the photos to somewhere that is not the Pi
- deploying automatically when `main` changes
- adding healthchecks and startup readiness handling

