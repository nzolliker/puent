import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { db } from "../db";
import {
  albums as albumsTable,
  photos as photosTable,
  insertAlbumSchema,
} from "../db/schema/photos";

import { createAlbumSchema } from "../sharedTypes";
import { asc, count, eq } from "drizzle-orm";

export const albumsRoutes = new Hono()

  .get("/", async (c) => {
    const albums = await db
      .select({
        id: albumsTable.id,
        name: albumsTable.name,
        createdAt: albumsTable.createdAt,
        photoCount: count(photosTable.id),
      })
      .from(albumsTable)
      .leftJoin(photosTable, eq(photosTable.albumId, albumsTable.id))
      .groupBy(albumsTable.id, albumsTable.name, albumsTable.createdAt)
      .orderBy(asc(albumsTable.name));

    return c.json({ albums });
  })

  .post("/", zValidator("json", createAlbumSchema), async (c) => {
    const album = c.req.valid("json");

    const validatedAlbum = insertAlbumSchema.parse({ ...album });

    const result = await db
      .insert(albumsTable)
      .values({ ...validatedAlbum })
      .$returningId();

    c.status(201);
    return c.json(result);
  })

  .delete("/:id{[0-9]+}", async (c) => {
    const id = Number.parseInt(c.req.param("id"));

    // Photos are kept: the foreign key clears album_id and they move back to
    // "Ohne Album".
    await db.delete(albumsTable).where(eq(albumsTable.id, id));

    return c.json({ id: id });
  });
