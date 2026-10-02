import { gardenLayoutSchema, type Bed } from "./schema";

/**
 * The plan of the garden: the edge of the plot and every bed on it.
 *
 * This file is the only place the layout lives. The server reads it to check
 * that a planting names a bed and cells that exist, and the browser imports
 * the same file to draw the plan, so there is no table to keep in step and
 * nothing to run after changing it.
 *
 * Measured in metres from the top-left corner of the plot: x to the right, y
 * downwards. See schema.ts for what a bed may look like.
 *
 * PLACEHOLDER. These beds are made up so the page has something to draw; the
 * real ones replace them once the plot has been sketched and measured.
 *
 * Parsed on import, so a typo here stops the server from starting instead of
 * drawing half a garden.
 */
export const gardenLayout = gardenLayoutSchema.parse({
  outline: [
    [0, 0],
    [14, 0],
    [0, 10],
  ],
  beds: [
    { key: "beet-1", name: "Beet 1", shape: "rect", x: 1, y: 1, w: 4, h: 1.5, grid: [4, 2] },
    { key: "beet-2", name: "Beet 2", shape: "rect", x: 1, y: 3.2, w: 3, h: 1.5, grid: [3, 2] },
    { key: "beet-3", name: "Beet 3", shape: "rect", x: 1, y: 5.4, w: 2, h: 1.5, grid: [2, 2] },
    { key: "kraeuter", name: "Kräuter", shape: "circle", cx: 7.2, cy: 1.8, r: 1, grid: [2, 2] },
    {
      key: "spitz",
      name: "Spitz",
      shape: "polygon",
      points: [
        [9.5, 0.6],
        [12.4, 0.6],
        [9.5, 2.6],
      ],
      grid: [2, 2],
    },
  ],
});

export function findBed(key: string): Bed | undefined {
  return gardenLayout.beds.find((bed) => bed.key === key);
}
