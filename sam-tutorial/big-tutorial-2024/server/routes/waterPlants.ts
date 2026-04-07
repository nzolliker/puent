import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { db } from "../db";
import {
  waterPlants as waterPlantsTable,
  insertWaterDateSchema,
} from "../db/schema/waterPlants";

import { createWaterSchema } from "../sharedTypes";
import { desc, sum, eq } from "drizzle-orm";

/*
const waterPlantsSchema = z.object({
  id: z.number().positive(),
  name: z.string(),
  date: z.date(),
});

type waterPlants = z.infer<typeof waterPlantsSchema>;

const fakeWaterPlants: waterPlants[] = [
  { id: 1, name: "Nicola", date: new Date(2026, 3, 19) },
  { id: 2, name: "Marek", date: new Date(2026, 3, 22) },
];
*/

export const waterPlantsRoutes = new Hono()
  /*
  .get("/fake", async (c) => {
    return c.json({ waterPlants: fakeWaterPlants });
  })
    */

  .get("/", async (c) => {
    const result = await db
      .select()
      .from(waterPlantsTable)
      .orderBy(desc(waterPlantsTable.date));

    return c.json({ waterPlants: result });
  })

  .post("/", zValidator("json", createWaterSchema), async (c) => {
    const waterDate = c.req.valid("json");

    const validatedwaterDate = insertWaterDateSchema.parse({
      ...waterDate,
    });

    const result = await db
      .insert(waterPlantsTable)
      .values({ ...validatedwaterDate })
      .$returningId();

    c.status(201);
    return c.json(result);
  });

