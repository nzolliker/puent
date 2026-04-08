import {
  decimal,
  mysqlTable,
  serial,
  text,
  date,
  timestamp,
} from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const waterPlants = mysqlTable("waterPlants", {
  id: serial().primaryKey(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow(),
  date: date("date").notNull(),
});

export const insertWaterDateSchema = createInsertSchema(waterPlants, {
  name: z.string().min(1),
  date: z.coerce.date(),
});

export const selectWaterDateSchema = createSelectSchema(waterPlants, {
  name: z.string().min(1),
  date: z.coerce.date(),
});
