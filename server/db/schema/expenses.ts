import {
  decimal,
  mysqlTable,
  serial,
  text,
  timestamp,
  date,
} from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const expenses = mysqlTable("expenses", {
  id: serial().primaryKey(),
  title: text("title"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  date: date("date").notNull(),
});

export const insertExpenseSchema = createInsertSchema(expenses, {
  title: z.string().min(1),
  amount: z
    .string()
    .regex(
      /^\d+(\.\d{1,2})?$/,
      "Positive amount with up to two decimal places",
    ),
  date: z.coerce.date(),
});

export const selectExpenseSchema = createSelectSchema(expenses, {
  title: z.string().min(3, { message: "Titel erforderlich" }),
  amount: z
    .string()
    .regex(
      /^\d+(\.\d{1,2})?$/,
      "Positive amount with up to two decimal places",
    ),
});

