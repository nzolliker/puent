# Deployment Runbook

## deployment quick description:

1. On your MacBook, commit and push the new code:

`
git add .
git commit -m "Add new feature"
git push
`

2. SSH into the Pi and go to the production checkout:

3. Pull the new version:

`
git status
git pull
`

4. Rebuild the app image from the updated code:

`docker compose --env-file .env.production build app`

5. Recreate/start the app with the new image:

`docker compose --env-file .env.production up -d app`

6. If the feature includes DB schema changes, run migrations:

`docker exec -it puent-app bunx drizzle-kit migrate`

7. Verify the deployment:

`
docker compose --env-file .env.production ps
docker logs puent-app --tail 100
curl -i http://localhost:3000/
curl -i http://localhost:3000/api/expenses
`

## Goal

This project runs in two clearly separated environments:

- Development: local machine, local source code, development-only database
- Production: Raspberry Pi, production Git checkout, production-only MySQL container

The point of this setup is to keep development and production isolated while still using a simple manual deployment workflow that is easy to understand.

## Production Architecture

The Raspberry Pi runs one Docker Compose stack with two services:

- `app`: the Bun server, which serves the built frontend and the API
- `mysql`: the production MySQL database

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

`UPLOAD_DIR` has to be set here because `docker-compose.yml` lists the app's
environment variables explicitly rather than passing the whole file through.
It must point at the mount path of the `uploads` volume.

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
curl -i http://localhost:3000/api/expenses
curl -i http://localhost:3000/api/water-plants
```

From another machine on the same network:

```bash
curl -i http://<pi-ip>:3000/
curl -i http://<pi-ip>:3000/api/expenses
```

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
curl -i http://localhost:3000/api/expenses
curl -i http://localhost:3000/api/water-plants
docker logs puent-app --tail 50
```

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
curl -i http://localhost:3000/
curl -i http://localhost:3000/api/expenses
```

## Recommended Deployment Order

When shipping a new version, use this order:

1. `git pull`
2. `docker compose --env-file .env.production build app`
3. `docker compose --env-file .env.production up -d app`
4. `docker exec -it puent-app bunx drizzle-kit migrate`
5. verify with logs and `curl`

This order works well for this project because:

- the code update happens first
- the new container is created from the updated code
- migrations are run against the correct production DB
- the final verification is explicit

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

Neither volume is backed up yet. Photos are the one kind of data here that
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

- the app is exposed on port `3000`
- MySQL is exposed on port `3306`
- the Bun server serves static files from `frontend/dist`
- the API lives under `/api`
- Drizzle migrations are in `drizzle/`
- production env vars are stored in `.env.production`

## Possible Later Improvements

This setup is intentionally simple. Later improvements could include:

- removing public exposure of MySQL if not needed
- adding a reverse proxy such as Caddy or Nginx
- adding HTTPS
- adding backups for the MySQL volume
- adding a dedicated deploy script
- adding healthchecks and startup readiness handling

