import { z } from "zod";
import { insertExpenseSchema, selectExpenseSchema } from "./db/schema/expenses";
import { insertAlbumSchema } from "./db/schema/photos";
import {
  insertWaterDateSchema,
} from "./db/schema/waterPlants";
import { insertTodoSchema, selectTodoSchema } from "./db/schema/todos";

// expenses
// `createdBy` and `userId` are not in the payload: the server reads both off
// the session, so the browser cannot claim to be someone else.
export const createExpenseSchema = insertExpenseSchema.omit({
  id: true,
  createdAt: true,
  createdBy: true,
  userId: true,
});

export const createExpenseFormSchema = selectExpenseSchema.omit({
  id: true,
  createdAt: true,
  createdBy: true,
  userId: true,
});

// watering
// Same rule as the expenses payload: the name comes from the session.
export const createWaterSchema = insertWaterDateSchema.omit({
  id: true,
  createdAt: true,
  name: true,
  userId: true,
});

export const createWaterFormSchema = z.object({
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

// plantings
// A day as the `YYYY-MM-DD` an <input type="date"> produces. Kept a string end
// to end, so no timezone gets a chance to move it.
const dayKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Datum erforderlich" })
  // Date.parse alone lets 31 February through and rolls it into March, so the
  // day has to survive the round trip.
  .refine(
    (value) => {
      const time = Date.parse(`${value}T00:00:00Z`);
      return (
        !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
      );
    },
    {
      message: "Dieses Datum gibt es nicht",
    },
  );

const cropName = z
  .string()
  .trim()
  .min(1, { message: "Was wurde gepflanzt?" })
  .max(120);

// Whether the bed and its cells exist is checked in the route, against the
// layout. Who entered it comes from the session, as everywhere else.
export const createPlantingSchema = z.object({
  bedKey: z.string().min(1).max(40),
  cells: z.array(z.number().int().min(0)).min(1),
  crop: cropName,
  note: z.string().trim().max(1000).nullish(),
  plantedAt: dayKey,
  removedAt: dayKey.nullish(),
  photoId: z.number().int().positive().nullish(),
});

// Clearing a bed away is this call with only `removedAt`; putting a planting
// back is the same call with `removedAt: null`. A planting never changes beds.
export const updatePlantingSchema = createPlantingSchema
  .omit({ bedKey: true })
  .partial();

export const plantingHistoryQuerySchema = z.object({
  bedKey: z.string().min(1).max(40),
});

// The dialog's fields. Dates and the note are "" when empty, because that is
// what the inputs hold.
export const plantingFormSchema = z
  .object({
    crop: cropName,
    note: z.string().max(1000),
    plantedAt: dayKey,
    removedAt: z.union([z.literal(""), dayKey]),
    cells: z
      .array(z.number())
      .min(1, { message: "Mindestens ein Feld auswählen" }),
  })
  .refine((value) => value.removedAt === "" || value.removedAt >= value.plantedAt, {
    path: ["removedAt"],
    message: "Liegt vor dem Pflanzdatum",
  });
