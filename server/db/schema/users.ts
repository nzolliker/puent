import { mysqlTable, serial, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// There is no password here, and no session table next to it. Cloudflare
// Access signs people in and tells the app their e-mail address; this table
// only says which of those addresses belong to a gardener, and under what name.
export const users = mysqlTable("users", {
  id: serial().primaryKey(),
  // A short handle for `bun run create-user`. Nobody signs in with it.
  username: varchar("username", { length: 60 }).notNull().unique(),
  // The display name. This is what lands in `waterPlants.name` and
  // `expenses.created_by`, so it is the value that used to be typed by hand.
  name: text("name").notNull(),
  // What an Access token is matched against, stored lowercase. Nullable: an
  // account without one is a name on old rows that nobody can act as.
  email: varchar("email", { length: 255 }).unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users, {
  username: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9_-]+$/, "Lowercase letters, digits, - and _ only"),
  name: z.string().min(1),
  email: z.email().max(255),
});

export const selectUserSchema = createSelectSchema(users);
