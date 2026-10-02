import type { Bed, GardenLayout, Point } from "./schema";

/**
 * What the plan needs worked out from a bed's shape. Pure functions with no
 * database and no DOM in them, because the server uses them to check a
 * planting's cells and the browser uses them to draw the same cells.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type BedCell = Rect & { index: number };

function boundsOf(points: readonly Point[]): Rect {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function bedBounds(bed: Bed): Rect {
  switch (bed.shape) {
    case "rect":
      return { x: bed.x, y: bed.y, w: bed.w, h: bed.h };
    case "circle":
      return {
        x: bed.cx - bed.r,
        y: bed.cy - bed.r,
        w: 2 * bed.r,
        h: 2 * bed.r,
      };
    case "polygon":
      return boundsOf(bed.points);
  }
}

/** Where a bed's name goes. */
export function bedCentre(bed: Bed): Point {
  switch (bed.shape) {
    case "rect":
      return [bed.x + bed.w / 2, bed.y + bed.h / 2];
    case "circle":
      return [bed.cx, bed.cy];
    case "polygon": {
      // The mean of the corners rather than the middle of the bounding box,
      // which for a triangle sits on its longest edge.
      const sum = bed.points.reduce(
        (acc, [x, y]) => [acc[0] + x, acc[1] + y] as Point,
        [0, 0] as Point,
      );
      return [sum[0] / bed.points.length, sum[1] / bed.points.length];
    }
  }
}

function isInside(bed: Bed, x: number, y: number): boolean {
  switch (bed.shape) {
    case "rect":
      return (
        x >= bed.x && x <= bed.x + bed.w && y >= bed.y && y <= bed.y + bed.h
      );
    case "circle":
      return (x - bed.cx) ** 2 + (y - bed.cy) ** 2 <= bed.r ** 2;
    case "polygon": {
      // Ray casting: count the edges a line from the point to the right
      // crosses. An odd count is inside.
      const points = bed.points;
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i]!;
        const [xj, yj] = points[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      return inside;
    }
  }
}

const SAMPLES_PER_EDGE = 5;
/** A cell with less of the bed in it than this is not worth planting. */
const MIN_COVERAGE = 0.25;

/** How much of a cell lies on the bed, from 0 to 1. */
function coverage(bed: Bed, cell: Rect): number {
  let hits = 0;
  for (let row = 0; row < SAMPLES_PER_EDGE; row++) {
    for (let col = 0; col < SAMPLES_PER_EDGE; col++) {
      const x = cell.x + ((col + 0.5) / SAMPLES_PER_EDGE) * cell.w;
      const y = cell.y + ((row + 0.5) / SAMPLES_PER_EDGE) * cell.h;
      if (isInside(bed, x, y)) hits++;
    }
  }
  return hits / SAMPLES_PER_EDGE ** 2;
}

/**
 * The cells of a bed: its grid laid over the bounding box, minus the cells
 * that fall off the shape.
 *
 * Coverage rather than "is the middle of the cell inside", because on a
 * right-angled triangle the cells along the long edge are cut exactly through
 * the middle, and whether they exist would come down to rounding.
 *
 * `index` counts along the full grid, row by row, whether or not the cells
 * before it exist. That keeps a cell's number tied to its place, which is what
 * a stored planting relies on.
 */
export function bedCells(bed: Bed): BedCell[] {
  const bounds = bedBounds(bed);
  const [cols, rows] = bed.grid;
  const w = bounds.w / cols;
  const h = bounds.h / rows;

  const cells: BedCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = {
        index: row * cols + col,
        x: bounds.x + col * w,
        y: bounds.y + row * h,
        w,
        h,
      };
      if (coverage(bed, cell) >= MIN_COVERAGE) {
        cells.push(cell);
      }
    }
  }

  return cells;
}

/** The plot with some air around it, as an SVG viewBox. */
export function planViewBox(layout: GardenLayout, margin = 0.5): Rect {
  const bounds = boundsOf(layout.outline);

  return {
    x: bounds.x - margin,
    y: bounds.y - margin,
    w: bounds.w + 2 * margin,
    h: bounds.h + 2 * margin,
  };
}
