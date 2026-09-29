import { mysqlTable, serial, text, timestamp } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const todos = mysqlTable("todos", {
  id: serial().primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  // Null means open. Ticking a to-do sets it, undoing clears it again, so the
  // history is these same rows rather than a second table.
  completedAt: timestamp("completed_at"),
});

export const insertTodoSchema = createInsertSchema(todos, {
  title: z.string().min(1),
});

export const selectTodoSchema = createSelectSchema(todos, {
  title: z.string().min(1, { message: "Titel erforderlich" }),
});
