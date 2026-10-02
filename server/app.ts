import { Hono } from "hono";
import { logger } from "hono/logger";
import { expensesRoutes } from "./routes/expenses";
import { waterPlantsRoutes } from "./routes/waterPlants";
import { photosRoutes } from "./routes/photos";
import { albumsRoutes } from "./routes/albums";
import { todosRoutes } from "./routes/todos";
import { plantingsRoutes } from "./routes/plantings";
import { authRoutes } from "./routes/auth";
import {
  loadUser,
  requireAccess,
  requireAuth,
  type AppEnv,
} from "./lib/auth";
import { serveStatic } from "hono/bun";
import { csrf } from "hono/csrf";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { resolvePhotoPath } from "./lib/photoStorage";

const app = new Hono<AppEnv>();

app.use(logger());

// Hono matches in registration order, so everything in this block has to be
// registered before the routes below or it never runs.

// First, and on the app rather than on /api: the photos and the frontend are
// behind it as well.
app.use("*", requireAccess);

// Who somebody is now rides on a cookie Cloudflare sets, which the browser
// attaches to cross-site requests too. JSON requests are covered by the
// preflight; the photo upload is multipart/form-data and is not.
//
// The origin is compared by host only: the tunnel hands requests over as plain
// HTTP, so the scheme in `c.req.url` never matches the `https://` the browser
// put in Origin.
app.use(
  "*",
  csrf({
    origin: (origin, c) => URL.parse(origin)?.host === c.req.header("host"),
  }),
);

const api = app.basePath("/api");

api.use("*", loadUser);

// Looking is open to everyone Access lets in; changing anything needs an
// account. The rule is on the method rather than on each route, so a new POST
// is protected the day it is written instead of the day someone remembers to
// guard it.
api.use("*", async (c, next) =>
  c.req.method === "GET" ? next() : requireAuth(c, next),
);

const authApi = api.route("/auth", authRoutes);
const expensesApi = api.route("/expenses", expensesRoutes);
const waterPlantsApi = api.route("/water-plants", waterPlantsRoutes);
const photosApi = api.route("/photos", photosRoutes);
const albumsApi = api.route("/albums", albumsRoutes);
const todosApi = api.route("/todos", todosRoutes);
const plantingsApi = api.route("/plantings", plantingsRoutes);
//

//const apiRoutes = app.basePath("/api").route("/expenses", expensesRoutes)

// Uploaded photos. This has to stay above the SPA catch-alls below, or the
// index.html fallback swallows it. Serving goes through resolvePhotoPath so
// the key is validated instead of trusting the URL.
app.get("/uploads/:year{[0-9]{4}}/:month{[0-9]{2}}/:file", async (c) => {
  const { year, month, file } = c.req.param();

  const isThumb = file.endsWith(".thumb.webp");
  const name = file.replace(/\.thumb\.webp$|\.webp$/, "");
  if (name === file) {
    return c.notFound();
  }

  const filePath = resolvePhotoPath(
    `${year}/${month}/${name}`,
    isThumb ? "thumb" : "display",
  );
  if (!filePath) {
    return c.notFound();
  }

  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return c.notFound();
  }

  // A new upload always gets a new key, so a key's bytes never change.
  const stream = Readable.toWeb(
    createReadStream(filePath),
  ) as ReadableStream<Uint8Array>;

  return new Response(stream, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

app.get("*", serveStatic({ root: "./frontend/dist" }));
app.get("*", serveStatic({ path: "./frontend/dist/index.html" }));

export default app;
export type ApiRoutes =
  | typeof authApi
  | typeof expensesApi
  | typeof waterPlantsApi
  | typeof photosApi
  | typeof albumsApi
  | typeof todosApi
  | typeof plantingsApi;
