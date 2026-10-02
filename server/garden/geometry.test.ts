import { describe, expect, test } from "bun:test";

import { bedBounds, bedCells, labelSlot, planViewBox } from "./geometry";
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

describe("labelSlot", () => {
  // 4 columns by 2 rows, each cell 1 m wide and 0.5 m high, from (1, 2).
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

  test("a run in one row is the slot", () => {
    expect(labelSlot(bed, [1, 2, 3])).toEqual({ x: 2, y: 2, w: 3, h: 0.5 });
  });

  test("an L takes its wide arm, not its corner", () => {
    // The left column and the whole bottom row.
    expect(labelSlot(bed, [0, 4, 5, 6, 7])).toEqual({ x: 1, y: 2.5, w: 4, h: 0.5 });
  });

  test("a block over two rows is centred over both", () => {
    expect(labelSlot(bed, [0, 1, 4, 5])).toEqual({ x: 1, y: 2, w: 2, h: 1 });
  });

  test("two patches that do not touch give the wider one", () => {
    expect(labelSlot(bed, [0, 2, 3])).toEqual({ x: 3, y: 2, w: 2, h: 0.5 });
  });

  test("cells the bed does not have give nothing", () => {
    expect(labelSlot(bed, [8, 9])).toBeNull();
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
