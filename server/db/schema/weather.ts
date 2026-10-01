import {
  date,
  mysqlEnum,
  mysqlTable,
  real,
  timestamp,
} from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * Cached daily rainfall for Winterthur, from MeteoSchweiz open data.
 *
 * One row per day, so the day carries the primary key instead of the usual
 * serial() id -- this is a cache keyed by date, not a list of entities, and it
 * is what lets the refresh upsert without a second unique index.
 */
export const weatherDays = mysqlTable("weatherDays", {
  // mode "string" so the `YYYY-MM-DD` day key the rest of the app passes
  // around goes in and comes back out unchanged, with no Date in between to
  // shift it across a timezone.
  date: date("date", { mode: "string" }).primaryKey(),
  // real(), not decimal(): decimal comes back from mysql2 as a *string* (which
  // is why expenses.amount is validated as one), and this column exists to be
  // compared against a threshold. "10" >= "2" is false. Millimetres may be a
  // float; money may not.
  precipMm: real("precip_mm").notNull(),
  // A day starts out forecast and is overwritten with the station measurement
  // once MeteoSchweiz publishes it, which is why the upsert sets this too.
  source: mysqlEnum("source", ["measured", "forecast"]).notNull(),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});

export const insertWeatherDaySchema = createInsertSchema(weatherDays);

export const selectWeatherDaySchema = createSelectSchema(weatherDays);
