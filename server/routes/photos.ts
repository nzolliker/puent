import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";

import { db } from "../db";
import { albums as albumsTable, photos as photosTable } from "../db/schema/photos";

import { photoMetadataSchema, photosQuerySchema } from "../sharedTypes";
import { desc, eq } from "drizzle-orm";
import {
  UnsupportedImageError,
  deletePhotoFiles,
  savePhoto,
} from "../lib/photoStorage";

/** No reverse proxy sits in front of Bun, so this is the only size guard. */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Multipart text fields arrive as strings; empty means "not set". */
function optionalField(value: File | string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export const photosRoutes = new Hono()

  .get("/", zValidator("query", photosQuerySchema), async (c) => {
    const { albumId, limit } = c.req.valid("query");

    const photos = await db
      .select()
      .from(photosTable)
      .where(albumId ? eq(photosTable.albumId, albumId) : undefined)
      .orderBy(desc(photosTable.createdAt))
      .limit(limit ?? 200);

    return c.json({ photos });
  })

  .post(
    "/",
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (c) => {
        c.status(413);
        return c.json({ error: "Die Bilder sind zusammen zu gross (max. 15 MB)" });
      },
    }),
    async (c) => {
      let formData: FormData;
      try {
        formData = await c.req.formData();
      } catch (error) {
        console.error("[photos] formData parse failed:", error);
        c.status(400);
        return c.json({
          error: "Der Upload konnte nicht gelesen werden",
          detail: error instanceof Error ? error.message : String(error),
        });
      }

      const metadataResult = photoMetadataSchema.safeParse({
        caption: optionalField(formData.get("caption")),
        takenAt: optionalField(formData.get("takenAt")),
        albumId: optionalField(formData.get("albumId")),
      });

      if (!metadataResult.success) {
        c.status(400);
        return c.json({ error: "Ungültige Angaben zum Foto" });
      }
      const { caption, takenAt, albumId } = metadataResult.data;

      if (albumId !== undefined) {
        const album = await db
          .select({ id: albumsTable.id })
          .from(albumsTable)
          .where(eq(albumsTable.id, albumId))
          .then((res) => res[0]);

        if (!album) {
          c.status(400);
          return c.json({ error: "Dieses Album gibt es nicht mehr" });
        }
      }

      const files = formData
        .getAll("file")
        .filter((entry): entry is File => entry instanceof File);

      if (files.length === 0) {
        c.status(400);
        return c.json({ error: "Keine Bilddatei erhalten" });
      }

      const saved: { id: number; storageKey: string }[] = [];
      const failed: { name: string; reason: string }[] = [];

      // Sequential on purpose: sharp is CPU-heavy and the Pi has few cores.
      for (const file of files) {
        let storageKey: string | undefined;
        try {
          const stored = await savePhoto(await file.arrayBuffer());
          storageKey = stored.storageKey;

          const result = await db
            .insert(photosTable)
            .values({
              albumId: albumId ?? null,
              storageKey: stored.storageKey,
              width: stored.width,
              height: stored.height,
              bytes: stored.bytes,
              caption: caption ?? null,
              takenAt: takenAt ?? null,
            })
            .$returningId();

          saved.push({
            id: result[0]!.id,
            storageKey: stored.storageKey,
          });
        } catch (error) {
          // savePhoto may already have written both files before the insert
          // failed; leaving them behind would fill the volume with orphans.
          if (storageKey) {
            await deletePhotoFiles(storageKey);
          }
          console.error("[photos] upload failed for", file.name, error);
          failed.push({
            name: file.name,
            reason:
              error instanceof UnsupportedImageError
                ? error.message
                : "Das Bild konnte nicht gespeichert werden",
          });
        }
      }

      // A partly successful batch reports both halves rather than failing whole.
      c.status(saved.length > 0 ? 201 : 400);
      return c.json({ photos: saved, failed });
    },
  )

  .delete("/:id{[0-9]+}", async (c) => {
    const id = Number.parseInt(c.req.param("id"));

    const photo = await db
      .select()
      .from(photosTable)
      .where(eq(photosTable.id, id))
      .then((res) => res[0]);

    if (!photo) {
      return c.notFound();
    }

    await db.delete(photosTable).where(eq(photosTable.id, id));
    await deletePhotoFiles(photo.storageKey);

    return c.json({ id: id });
  });
