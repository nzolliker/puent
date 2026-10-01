import {
  bigint,
  mysqlTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = mysqlTable("users", {
  id: serial().primaryKey(),
  username: varchar("username", { length: 60 }).notNull().unique(),
  // The display name. This is what lands in `waterPlants.name` and
  // `expenses.created_by`, so it is the value that used to be typed by hand.
  name: text("name").notNull(),
  // Null until the setup link is used, which is how a freshly created gardener
  // exists without a password anyone could guess.
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Only the hash of the cookie value is stored. A database dump therefore does
// not hand over live sessions -- the raw token exists in the browser and in the
// one response that set it, nowhere else.
export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  // serial() is `bigint unsigned`, so the foreign key has to match it.
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Same shape and the same hashing rule as a session, but single use: `usedAt`
// is what stops a setup link from being replayed after the password is set.
export const setupTokens = mysqlTable("setup_tokens", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users, {
  username: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9_-]+$/, "Lowercase letters, digits, - and _ only"),
  name: z.string().min(1),
});

export const selectUserSchema = createSelectSchema(users);
