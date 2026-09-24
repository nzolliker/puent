import { z } from "zod";
import { insertExpenseSchema, selectExpenseSchema } from "./db/schema/expenses";
import {
  insertWaterDateSchema,
} from "./db/schema/waterPlants";

// expenses
export const createExpenseSchema = insertExpenseSchema.omit({
  id: true,
  createdAt: true,
});

export const createExpenseFormSchema = selectExpenseSchema.omit({
  id: true,
  createdAt: true,
});

// watering
export const createWaterSchema = insertWaterDateSchema.omit({
  id: true,
  createdAt: true,
});

export const createWaterFormSchema = z.object({
  name: z.string().min(1),
  date: z.date().nullable(),
}).refine((value) => value.date !== null, {
  path: ["date"],
  message: "Bitte ein Datum auswählen",
});
