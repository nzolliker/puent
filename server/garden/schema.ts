import { z } from "zod";

/**
 * The shape of the garden plan in layout.ts.
 *
 * Everything is in metres and in one coordinate system: x runs to the right
 * and y runs down from the top-left corner, the way a sketch on paper is
 * measured. Keeping to one system is what would let a drawn picture go behind
 * the same shapes later without anything else having to move.
 */

const point = z.tuple([z.number(), z.number()]);
const length = z.number().positive();
const cellCount = z.number().int().min(1).max(12);

const bedBase = {
  // What a planting points at, so it has to outlive a rename. A bed whose grid
  // changes gets a new key: cell numbers are counted along the grid, and the
  // plantings already stored would land on different ground.
  key: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/, "Lowercase letters, digits and - only"),
  name: z.string().min(1).max(80),
  // Columns and rows laid over the bed's bounding box and cut to its shape. A
  // bed that is only ever planted whole leaves it out.
  grid: z.tuple([cellCount, cellCount]).default([1, 1]),
};

export const bedSchema = z.discriminatedUnion("shape", [
  z.object({
    ...bedBase,
    shape: z.literal("rect"),
    x: z.number(),
    y: z.number(),
    w: length,
    h: length,
  }),
  z.object({
    ...bedBase,
    shape: z.literal("circle"),
    cx: z.number(),
    cy: z.number(),
    r: length,
  }),
  z.object({
    ...bedBase,
    shape: z.literal("polygon"),
    points: z.array(point).min(3),
  }),
]);

export const gardenLayoutSchema = z
  .object({
    /** The edge of the plot. Drawn, never tapped. */
    outline: z.array(point).min(3),
    beds: z.array(bedSchema),
  })
  .refine(
    (layout) =>
      new Set(layout.beds.map((bed) => bed.key)).size === layout.beds.length,
    { message: "Two beds share a key" },
  );

export type Point = z.infer<typeof point>;
export type Bed = z.infer<typeof bedSchema>;
export type GardenLayout = z.infer<typeof gardenLayoutSchema>;
