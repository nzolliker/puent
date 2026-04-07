import { insertExpenseSchema, selectExpenseSchema } from "./db/schema/expenses";
import {
  selectWaterDateSchema,
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

export const createWaterFormSchema = selectWaterDateSchema.omit({
  id: true,
  createdAt: true,
});
