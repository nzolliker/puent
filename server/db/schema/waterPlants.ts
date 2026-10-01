import {
  bigint,
  mysqlTable,
  serial,
  text,
  date,
  timestamp,
} from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";

export const waterPlants = mysqlTable("waterPlants", {
  id: serial().primaryKey(),
  // Kept alongside `userId` on purpose: the rows that predate the login have a
  // name and no account to point at, and the calendar still reads this column.
  name: text("name"),
  // serial() is `bigint unsigned`, so the foreign key has to match it.
  // Nullable for those same pre-login rows.
  userId: bigint("user_id", { mode: "number", unsigned: true }).references(
    () => users.id,
    { onDelete: "set null" },
  ),
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
