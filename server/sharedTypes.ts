import { z } from "zod";
import { insertExpenseSchema, selectExpenseSchema } from "./db/schema/expenses";
import { insertAlbumSchema } from "./db/schema/photos";
import {
  insertWaterDateSchema,
} from "./db/schema/waterPlants";
import { insertTodoSchema, selectTodoSchema } from "./db/schema/todos";

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

// How much rain makes a day a rain day. Absent means "whatever the server's
// RAIN_THRESHOLD_MM says", so the Giess-Plan can override it per request
// without the default having to travel in the URL.
const rainThresholdParam = z.coerce.number().min(0).max(100).optional();

export const waterOverviewQuerySchema = z.object({
  days: z.coerce.number().int().min(0).max(14).default(3),
  thresholdMm: rainThresholdParam,
});

// photos
export const createAlbumSchema = insertAlbumSchema.omit({
  id: true,
  createdAt: true,
});

export const createAlbumFormSchema = z.object({
  name: z.string().min(1, { message: "Name erforderlich" }).max(80),
});

// The upload is multipart/form-data, so every field arrives as a string.
// Empty strings mean "not set" and have to become undefined before parsing.
export const photoMetadataSchema = z.object({
  caption: z.string().max(500).optional(),
  takenAt: z.coerce.date().optional(),
  albumId: z.coerce.number().int().positive().optional(),
});

export const photosQuerySchema = z.object({
  albumId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// todos
export const createTodoSchema = insertTodoSchema.omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const createTodoFormSchema = selectTodoSchema.omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

// Ticking a to-do and undoing it are the same call, so the body carries the
// state to move to rather than the action taken.
export const setTodoDoneSchema = z.object({
  done: z.boolean(),
});
