import { describe, expect, test } from "bun:test";

import { bedBounds, bedCells, planViewBox } from "./geometry";
import { gardenLayout } from "./layout";
import { bedSchema, gardenLayoutSchema } from "./schema";

const OUTLINE = [
  [0, 0],
  [10, 0],
  [0, 10],
];

describe("bedCells", () => {
  test("a rectangle keeps every cell of its grid, row by row", () => {
    const bed = bedSchema.parse({
      key: "r",
      name: "R",
      shape: "rect",
      x: 1,
      y: 2,
      w: 4,
      h: 1,
      grid: [4, 2],
    });

    const cells = bedCells(bed);

    expect(cells.map((cell) => cell.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(cells[5]).toEqual({ index: 5, x: 2, y: 2.5, w: 1, h: 0.5 });
  });

  // The case a centre-point test gets wrong: both cells on the long edge are
  // cut exactly through the middle.
  test("a right-angled triangle loses only the cell beyond its long edge", () => {
    const bed = bedSchema.parse({
      key: "t",
      name: "T",
      shape: "polygon",
      points: [
        [0, 0],
        [3, 0],
        [0, 2],
      ],
      grid: [2, 2],
    });

    expect(bedCells(bed).map((cell) => cell.index)).toEqual([0, 1, 2]);
  });

  test("a circle cut in four keeps its four quarters", () => {
    const bed = bedSchema.parse({
      key: "c",
      name: "C",
      shape: "circle",
      cx: 5,
      cy: 5,
      r: 1,
      grid: [2, 2],
    });

    expect(bedBounds(bed)).toEqual({ x: 4, y: 4, w: 2, h: 2 });
    expect(bedCells(bed)).toHaveLength(4);
  });

  test("a bed without a grid is one cell", () => {
    const bed = bedSchema.parse({
      key: "c",
      name: "C",
      shape: "circle",
      cx: 5,
      cy: 5,
      r: 1,
    });

    expect(bedCells(bed).map((cell) => cell.index)).toEqual([0]);
  });
});

describe("gardenLayoutSchema", () => {
  test("refuses two beds under one key", () => {
    const bed = { key: "a", name: "A", shape: "circle", cx: 1, cy: 1, r: 1 };

    const result = gardenLayoutSchema.safeParse({
      outline: OUTLINE,
      beds: [bed, { ...bed, name: "B" }],
    });

    expect(result.success).toBe(false);
  });
});

describe("the layout in layout.ts", () => {
  test("gives every bed at least one cell", () => {
    for (const bed of gardenLayout.beds) {
      expect(bedCells(bed).length).toBeGreaterThan(0);
    }
  });

  test("keeps every bed inside the frame the plan is drawn in", () => {
    const view = planViewBox(gardenLayout, 0);

    for (const bed of gardenLayout.beds) {
      const bounds = bedBounds(bed);
      expect(bounds.x).toBeGreaterThanOrEqual(view.x);
      expect(bounds.y).toBeGreaterThanOrEqual(view.y);
      expect(bounds.x + bounds.w).toBeLessThanOrEqual(view.x + view.w);
      expect(bounds.y + bounds.h).toBeLessThanOrEqual(view.y + view.h);
    }
  });
});
