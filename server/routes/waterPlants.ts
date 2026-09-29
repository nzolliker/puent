import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { db } from "../db";
import {
  waterPlants as waterPlantsTable,
  insertWaterDateSchema,
} from "../db/schema/waterPlants";

import { createWaterSchema, waterOverviewQuerySchema } from "../sharedTypes";
import { and, desc, gte, lte } from "drizzle-orm";
import type { AppEnv } from "../lib/auth";

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

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addOneDay(date: Date) {
  return addDays(date, 1);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
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

export const waterPlantsRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const result = await db
      .select()
      .from(waterPlantsTable)
      .orderBy(desc(waterPlantsTable.date));

    return c.json({ waterPlants: result });
  })
  // The name comes off the session, the same rule the expenses route follows.
  .post("/", zValidator("json", createWaterSchema), async (c) => {
    const waterDate = c.req.valid("json");
    // Non-null: the mutation guard in app.ts has already run.
    const user = c.get("user")!;

    const validatedwaterDate = insertWaterDateSchema.parse({
      ...waterDate,
      name: user.name,
      userId: user.id,
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

    let nextFreeDate = startOfToday();
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
  })

  .get("/overview", zValidator("query", waterOverviewQuerySchema), async (c) => {
    const { days } = c.req.valid("query");

    const today = startOfToday();
    const todayKey = toDayKey(today);

    const windowKeys = Array.from({ length: days * 2 + 1 }, (_, index) =>
      toDayKey(addDays(today, index - days)),
    );

    // The driver serializes these Dates in local time, so the bounds have to be
    // local midnight -- which is what addDays/startOfToday already produce.
    const rows = await db
      .select({ date: waterPlantsTable.date, name: waterPlantsTable.name })
      .from(waterPlantsTable)
      .where(
        and(
          gte(waterPlantsTable.date, addDays(today, -days)),
          lte(waterPlantsTable.date, addDays(today, days)),
        ),
      );

    // A day counts as taken as soon as a row exists for it, even if the name is
    // empty -- same rule the calendar and /next-free-date already use.
    const bookedDays = new Set<string>();
    const namesByDay = new Map<string, string[]>();

    for (const row of rows) {
      const dayKey = toDayKey(row.date);
      bookedDays.add(dayKey);

      const name = row.name?.trim();
      if (!name) {
        continue;
      }

      const names = namesByDay.get(dayKey);
      if (names) {
        names.push(name);
      } else {
        namesByDay.set(dayKey, [name]);
      }
    }

    const overviewDays = windowKeys.map((dayKey) => ({
      date: dayKey,
      names: namesByDay.get(dayKey) ?? [],
      isOpen: !bookedDays.has(dayKey),
      isToday: dayKey === todayKey,
    }));

    return c.json({
      today: todayKey,
      openCount: overviewDays.filter((day) => day.isOpen).length,
      days: overviewDays,
    });
  });
