# puent

A small web app for our garden group, and my playground for learning full-stack
TypeScript.

The practical part: the group shares a garden plot, so somebody has to water it
and somebody pays for seeds and soil. `puent` keeps both in one place — a
watering rota you can sign up for, and a running list of shared expenses. It
runs on a Raspberry Pi at home.

The learning part: everything here is built to be understood rather than to be
impressive. One Bun process, one database, no framework magic, no build step I
cannot explain. The interface is in German because that is what the garden group
speaks; the code and this README are in English.

## What it does today

**Watering rota**
- Dashboard strip showing the week around today: who has signed up, which days
  are still open, and how many of them there are.
- Clicking an open day jumps to the calendar with that date preselected.
- "Next free day" tells you the first day nobody has claimed yet.
- Signing up is a name and a date — one row in the `waterPlants` table.

**Shared expenses**
- Add an expense with a title, an amount and a date.
- List all expenses, delete the ones entered by mistake.
- Running total in CHF on the dashboard.

**Not yet**
- No login. Anyone who can reach the app can sign up for a day or add an expense.
  That is fine on a home network and is the first thing on the roadmap.
- No tests and no CI.
- Expenses are a flat list — no per-person split, no settling up.

## Stack

| Layer | Choice | Where |
| --- | --- | --- |
| Runtime | Bun | `server/index.ts` (`Bun.serve`) |
| HTTP | Hono | `server/app.ts` — API under `/api`, static files from `frontend/dist` |
| Database | MySQL 8.4 | `docker-compose.yml` |
| ORM | Drizzle | `server/db/index.ts`, schemas in `server/db/schema/` |
| Migrations | drizzle-kit | `drizzle.config.ts`, SQL in `drizzle/` |
| Validation | Zod + drizzle-zod | `server/sharedTypes.ts` |
| UI | React 19 + Vite 7 | `frontend/` |
| Routing | TanStack Router (file-based) | `frontend/src/routes/` |
| Data / forms | TanStack Query + TanStack Form | per-route query helpers |
| Styling | Tailwind v4 + shadcn/Radix primitives | `frontend/src/components/ui/` |
| Deployment | Docker Compose on a Raspberry Pi | [`DEPLOYMENT.md`](DEPLOYMENT.md) |

The piece I like most: the frontend does not hand-write API calls. `server/app.ts`
exports its route types, and `frontend/src/lib/api.ts` feeds them to
`hono/client`:

```ts
const client = hc<ApiRoutes>('/')
export const api = client.api
// api["water-plants"].overview.$get({ query: {} })
```

The frontend reaches the server types through the `@server/*` alias in
`frontend/vite.config.ts`, so renaming a route or changing a response shape turns
into a type error in the components that use it, not a 404 at runtime. The Zod
schemas in `server/sharedTypes.ts` travel the same way and validate both the
request on the server and the form in the browser.

### API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/water-plants` | all watering entries, newest date first |
| `POST` | `/api/water-plants` | sign up for a day |
| `GET` | `/api/water-plants/next-free-date` | first unclaimed day, and how far away it is |
| `GET` | `/api/water-plants/overview?days=3` | day-by-day window around today |
| `GET` | `/api/expenses` | all expenses |
| `POST` | `/api/expenses` | add an expense |
| `GET` | `/api/expenses/total-spent` | sum of all amounts |
| `GET` `DELETE` | `/api/expenses/:id` | fetch or remove one expense |

## Repo layout

```
server/       Hono app, routes, Drizzle schemas, shared Zod schemas
frontend/     React app (Vite); `bun run build` outputs to frontend/dist
drizzle/      generated SQL migrations
tutorials/    earlier React exercises — kept on purpose, not part of the app
DEPLOYMENT.md the Raspberry Pi runbook
```

## Getting started (local dev)

You need [Bun](https://bun.com) and a MySQL database you can reach. The quickest
database is a throwaway container:

```bash
docker run -d --name puent-dev-mysql \
  -e MYSQL_ROOT_PASSWORD=dev -e MYSQL_DATABASE=puent \
  -p 3306:3306 mysql:8.4
```

Then:

```bash
bun install
cd frontend && bun install && cd ..

# .env in the repo root
echo 'DATABASE_URL=mysql://root:dev@localhost:3306/puent' > .env

bun run db:migrate
```

Run the two halves in two terminals:

```bash
bun run dev                  # API on :3000, restarts on change
cd frontend && bun run dev   # Vite on :5173, proxies /api to :3000
```

Open http://localhost:5173. In production there is no Vite — the Bun server
serves `frontend/dist` and the API from the same port.

Other scripts: `bun run typecheck` at the root, `bun run lint` and
`bun run build` inside `frontend/`.

## Database & migrations

The schema lives in TypeScript, and the SQL in `drizzle/` is generated from it.

```bash
# 1. edit a table in server/db/schema/
# 2. generate the migration
bun run db:generate
# 3. apply it
bun run db:migrate
```

Commit the generated file in `drizzle/` together with the schema change —
production applies the same files.

## Deployment

The app runs on a Raspberry Pi as a two-service Docker Compose stack: `app` (the
Bun server, serving the built frontend and the API) and `mysql` (with its data in
a named volume). Deploying is push, pull on the Pi, rebuild the image, restart,
and run migrations if the schema moved.

The full runbook — environment separation, volumes, migrations against
production, recovery — is in [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Roadmap

- **Photo upload** — pictures of the plot attached to a date or a bed, so the
  season is visible and not just tabulated.
- **Plant & harvest logs** — what went into which bed and when, and what came
  back out. The part that makes the app useful next year, not just this week.
- **Users & login** — real accounts instead of typing your name into a field, so
  entries belong to someone and the app can leave the home network.
- **Shared to-do list** — the jobs that are not watering: weeding, fence repair,
  picking up compost.

## Why this project exists

I wanted one project that goes all the way down: a typed API boundary I actually
understand, migrations I run myself, and a server I deploy by hand to a machine
on my own desk. Every choice here leans towards the simple version — one process,
one database, plain SQL migrations, no hosting platform in between. The garden
group gives it real users, which is the part that keeps it honest.
