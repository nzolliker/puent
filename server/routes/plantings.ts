import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { db } from "../db";
import { photos as photosTable } from "../db/schema/photos";
import { plantings as plantingsTable } from "../db/schema/plantings";
import { bedCells } from "../garden/geometry";
import { findBed } from "../garden/layout";

import {
  createPlantingSchema,
  plantingHistoryQuerySchema,
  updatePlantingSchema,
} from "../sharedTypes";
import { and, desc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import type { AppEnv } from "../lib/auth";

// The photo's storage key rides along, so a list of plantings can show its
// thumbnails without a second request per row.
const plantingColumns = {
  id: plantingsTable.id,
  bedKey: plantingsTable.bedKey,
  cells: plantingsTable.cells,
  crop: plantingsTable.crop,
  note: plantingsTable.note,
  plantedAt: plantingsTable.plantedAt,
  removedAt: plantingsTable.removedAt,
  readyAt: plantingsTable.readyAt,
  photoId: plantingsTable.photoId,
  photoStorageKey: photosTable.storageKey,
  createdBy: plantingsTable.createdBy,
};

/** Why these cells cannot be planted in this bed, or null when they can. */
function cellsProblem(bedKey: string, cells: number[]): string | null {
  const bed = findBed(bedKey);
  if (!bed) {
    return "Dieses Beet gibt es nicht";
  }

  const existing = new Set(bedCells(bed).map((cell) => cell.index));
  if (
    new Set(cells).size !== cells.length ||
    cells.some((cell) => !existing.has(cell))
  ) {
    return "Diese Felder gibt es in diesem Beet nicht";
  }

  return null;
}

/**
 * The cells among `cells` that something else is growing in right now.
 *
 * Filtered here rather than in SQL: a bed has a handful of plantings at most,
 * and the overlap of two JSON arrays is not something MySQL says briefly.
 */
async function takenCells(bedKey: string, cells: number[], exceptId?: number) {
  const current = await db
    .select({ cells: plantingsTable.cells })
    .from(plantingsTable)
    .where(
      and(
        eq(plantingsTable.bedKey, bedKey),
        isNull(plantingsTable.removedAt),
        exceptId === undefined ? undefined : ne(plantingsTable.id, exceptId),
      ),
    );

  const taken = new Set(current.flatMap((row) => row.cells));
  return cells.filter((cell) => taken.has(cell));
}

async function photoExists(photoId: number) {
  const photo = await db
    .select({ id: photosTable.id })
    .from(photosTable)
    .where(eq(photosTable.id, photoId))
    .then((res) => res[0]);

  return photo !== undefined;
}

export const plantingsRoutes = new Hono<AppEnv>()

  // What is in the ground now, across all beds: the plan colours its cells
  // from this one list.
  .get("/", async (c) => {
    const plantings = await db
      .select(plantingColumns)
      .from(plantingsTable)
      .leftJoin(photosTable, eq(photosTable.id, plantingsTable.photoId))
      .where(isNull(plantingsTable.removedAt))
      .orderBy(desc(plantingsTable.plantedAt), desc(plantingsTable.id));

    return c.json({ plantings });
  })

  .get("/history", zValidator("query", plantingHistoryQuerySchema), async (c) => {
    const { bedKey } = c.req.valid("query");

    const plantings = await db
      .select(plantingColumns)
      .from(plantingsTable)
      .leftJoin(photosTable, eq(photosTable.id, plantingsTable.photoId))
      .where(
        and(
          eq(plantingsTable.bedKey, bedKey),
          isNotNull(plantingsTable.removedAt),
        ),
      )
      .orderBy(desc(plantingsTable.removedAt), desc(plantingsTable.id));

    return c.json({ plantings });
  })

  .post("/", zValidator("json", createPlantingSchema), async (c) => {
    const planting = c.req.valid("json");
    // Non-null: the mutation guard in app.ts has already run.
    const user = c.get("user")!;

    const problem = cellsProblem(planting.bedKey, planting.cells);
    if (problem) {
      return c.json({ error: problem }, 400);
    }

    // Day keys are `YYYY-MM-DD`, so a plain string compare orders them.
    if (planting.removedAt && planting.removedAt < planting.plantedAt) {
      return c.json({ error: "Abgeräumt vor dem Pflanzen" }, 400);
    }

    if (planting.photoId && !(await photoExists(planting.photoId))) {
      return c.json({ error: "Dieses Foto gibt es nicht mehr" }, 400);
    }

    // An entry made after the fact, already cleared away, takes no ground from
    // what is growing now.
    if (!planting.removedAt) {
      const taken = await takenCells(planting.bedKey, planting.cells);
      if (taken.length > 0) {
        return c.json({ error: "Dort wächst schon etwas", cells: taken }, 409);
      }
    }

    const result = await db
      .insert(plantingsTable)
      .values({
        bedKey: planting.bedKey,
        cells: planting.cells,
        crop: planting.crop,
        note: planting.note || null,
        plantedAt: planting.plantedAt,
        removedAt: planting.removedAt ?? null,
        readyAt: planting.readyAt ?? null,
        photoId: planting.photoId ?? null,
        createdBy: user.name,
        userId: user.id,
      })
      .$returningId();

    c.status(201);
    return c.json(result);
  })

  .patch(
    "/:id{[0-9]+}",
    zValidator("json", updatePlantingSchema),
    async (c) => {
      const id = Number.parseInt(c.req.param("id"));
      const patch = c.req.valid("json");

      const row = await db
        .select()
        .from(plantingsTable)
        .where(eq(plantingsTable.id, id))
        .then((res) => res[0]);

      if (!row) {
        return c.notFound();
      }

      // The rules are about the planting as it will be, not about the fields
      // that happen to be in this request.
      const cells = patch.cells ?? row.cells;
      const plantedAt = patch.plantedAt ?? row.plantedAt;
      const removedAt =
        patch.removedAt === undefined ? row.removedAt : patch.removedAt;

      if (patch.cells) {
        const problem = cellsProblem(row.bedKey, patch.cells);
        if (problem) {
          return c.json({ error: problem }, 400);
        }
      }

      if (removedAt && removedAt < plantedAt) {
        return c.json({ error: "Abgeräumt vor dem Pflanzen" }, 400);
      }

      if (patch.photoId && !(await photoExists(patch.photoId))) {
        return c.json({ error: "Dieses Foto gibt es nicht mehr" }, 400);
      }

      // Also catches a planting being put back from the log onto ground that
      // has been replanted since.
      if (!removedAt) {
        const taken = await takenCells(row.bedKey, cells, id);
        if (taken.length > 0) {
          return c.json({ error: "Dort wächst schon etwas", cells: taken }, 409);
        }
      }

      await db
        .update(plantingsTable)
        .set({
          cells: patch.cells,
          crop: patch.crop,
          note: patch.note === undefined ? undefined : patch.note || null,
          plantedAt: patch.plantedAt,
          removedAt: patch.removedAt,
          // Left standing when a planting is cleared away: by then it is a
          // record of when it ripened, and nothing shows it as pickable.
          readyAt: patch.readyAt,
          photoId: patch.photoId,
        })
        .where(eq(plantingsTable.id, id));

      return c.json({ id: id });
    },
  )

  .delete("/:id{[0-9]+}", async (c) => {
    const id = Number.parseInt(c.req.param("id"));

    await db.delete(plantingsTable).where(eq(plantingsTable.id, id));

    return c.json({ id: id });
  });
