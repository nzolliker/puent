import { Hono } from "hono";
import { logger } from "hono/logger";
import { expensesRoutes } from "./routes/expenses";
import { waterPlantsRoutes } from "./routes/waterPlants";
import { photosRoutes } from "./routes/photos";
import { albumsRoutes } from "./routes/albums";
import { serveStatic } from "hono/bun";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { resolvePhotoPath } from "./lib/photoStorage";

const app = new Hono();

app.use(logger());

const api = app.basePath("/api");
const expensesApi = api.route("/expenses", expensesRoutes);
const waterPlantsApi = api.route("/water-plants", waterPlantsRoutes);
const photosApi = api.route("/photos", photosRoutes);
const albumsApi = api.route("/albums", albumsRoutes);
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
  | typeof expensesApi
  | typeof waterPlantsApi
  | typeof photosApi
  | typeof albumsApi;
