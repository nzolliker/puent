import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { db } from "../db";
import {
  waterPlants as waterPlantsTable,
  insertWaterDateSchema,
} from "../db/schema/waterPlants";

import { createWaterSchema } from "../sharedTypes";
import { desc } from "drizzle-orm";

// helper functions
function toDayKey(value: string | Date) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addOneDay(date: Date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

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
  })

  .get("/next-free-date", async (c) => {
    const rows = await db
      .select({ date: waterPlantsTable.date })
      .from(waterPlantsTable);

    const bookedDates = new Set(
      rows.map((row) => row.date).map((date) => toDayKey(date)),
    );
    console.log(bookedDates);

    const today = new Date();
    const candidate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );

    let nextFreeDate = candidate;
    console.log(nextFreeDate);
    let counterDays = 0;

    while (bookedDates.has(toDayKey(nextFreeDate))) {
      counterDays = counterDays + 1;
      nextFreeDate = addOneDay(nextFreeDate);
    }

    return c.json({
      nextFreeDate: toDayKey(nextFreeDate),
      numberOfDays: counterDays,
    });
  });
