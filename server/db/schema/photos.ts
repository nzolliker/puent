import {
  bigint,
  int,
  mysqlTable,
  serial,
  text,
  timestamp,
  date,
  varchar,
} from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const albums = mysqlTable("albums", {
  id: serial().primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const photos = mysqlTable("photos", {
  id: serial().primaryKey(),
  // serial() is `bigint unsigned`, so the foreign key has to match it.
  albumId: bigint("album_id", { mode: "number", unsigned: true }).references(
    () => albums.id,
    { onDelete: "set null" },
  ),
  storageKey: varchar("storage_key", { length: 64 }).notNull().unique(),
  width: int("width").notNull(),
  height: int("height").notNull(),
  bytes: int("bytes").notNull(),
  caption: text("caption"),
  takenAt: date("taken_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAlbumSchema = createInsertSchema(albums, {
  name: z.string().min(1, { message: "Name erforderlich" }).max(80),
});

export const selectAlbumSchema = createSelectSchema(albums);

export const insertPhotoSchema = createInsertSchema(photos, {
  caption: z.string().max(500).nullish(),
  takenAt: z.coerce.date().nullish(),
});

export const selectPhotoSchema = createSelectSchema(photos);
