import {
  bigint,
  date,
  json,
  mysqlTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

import { photos } from "./photos";
import { users } from "./users";

/**
 * What grows in a bed, and what grew there before.
 *
 * One table for both: a planting with no `removedAt` is in the ground now, and
 * one with a date is the log. The same idea as `todos.completedAt`.
 */
export const plantings = mysqlTable("plantings", {
  id: serial().primaryKey(),
  // A bed's key in server/garden/layout.ts. Not a foreign key, because the
  // beds are not in the database -- the route checks it against the layout.
  bedKey: varchar("bed_key", { length: 40 }).notNull(),
  // Which cells of the bed's grid, as numbered by bedCells(). A bed without a
  // grid has the one cell, 0.
  cells: json("cells").$type<number[]>().notNull(),
  crop: varchar("crop", { length: 120 }).notNull(),
  note: text("note"),
  // mode "string" for the same reason as weatherDays.date: the `YYYY-MM-DD`
  // the browser sends goes in and comes back out with no Date in between to
  // shift it across a timezone.
  plantedAt: date("planted_at", { mode: "string" }).notNull(),
  removedAt: date("removed_at", { mode: "string" }),
  // serial() is `bigint unsigned`, so the foreign keys have to match it.
  // Deleting the photo leaves the planting standing without one.
  photoId: bigint("photo_id", { mode: "number", unsigned: true }).references(
    () => photos.id,
    { onDelete: "set null" },
  ),
  createdBy: text("created_by"),
  userId: bigint("user_id", { mode: "number", unsigned: true }).references(
    () => users.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at").defaultNow(),
});
