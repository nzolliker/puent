import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import { weatherDays } from "../db/schema/weather";

/**
 * Rainfall for the watering rota, from MeteoSchweiz open data.
 *
 * Two sources, because neither covers the whole window on its own:
 *
 *  - the automatic precipitation station "Winterthur / Seen" for days that are
 *    over, published up to yesterday;
 *  - the local forecast for "Winterthur / Veltheim" for today and the next few
 *    days.
 *
 * Both are plain CSV over HTTPS with no API key. Usage requires crediting
 * "MeteoSchweiz", which the Giess-Plan legend does.
 *
 * The weatherDays table is the cache of record; this module only decides when
 * to refresh it. Nothing here throws at its caller: rain is decoration on a
 * page that has to render without it.
 */

/**
 * Default threshold from which a day counts as rainy. A request may override it.
 *
 * Read through a function rather than a plain const because docker-compose
 * interpolates an unset variable to "", and Number("") is 0 -- which would mark
 * every dry day as rainy. Anything that is not a positive number falls back.
 */
export function defaultRainThresholdMm() {
  const value = Number(process.env.RAIN_THRESHOLD_MM);
  return Number.isFinite(value) && value > 0 ? value : 2;
}

/**
 * MeteoSchweiz automatic precipitation station "Winterthur / Seen", about 5 km
 * from the garden.
 *
 * That is as close as anyone measures: it is the only precipitation station in
 * Winterthur, and the next nearest in any MeteoSchweiz network is Effretikon at
 * 7 km. The cantonal stations that sit closer -- ZHWLF, ZHWIV, RGWIN, ZHWIN --
 * look like candidates in the forecast point list below, but none of them
 * publishes measurements, so they cannot replace this one.
 */
const STATION_ABBR = "win";
/**
 * MeteoSchweiz local-forecast point "Winterthur / Veltheim" (ZHWIV), the
 * nearest of the ~50 000 published points to the garden, at about 1 km.
 *
 * A station-type point rather than a postal-code centroid -- both kinds live in
 * the same file, and the ids are unique across the two, so the parser below
 * needs no help telling them apart.
 *
 * Checked, because there are two Veltheims: this is the Winterthur one, not
 * Veltheim AG (point 510600, 43 km west). swisstopo puts these coordinates in
 * the municipality of Winterthur.
 */
const FORECAST_POINT_ID = "10878";
/** Daily precipitation total, 00:00-24:00 local time. */
const FORECAST_PARAM = "rka150p0";
/**
 * How far ahead the forecast is shown.
 *
 * The file carries today plus eight days, so this uses eight of the nine rows
 * with one to spare. Should MeteoSchweiz ever publish a shorter horizon, the
 * windowing below simply writes fewer rows -- no special case needed.
 */
export const FORECAST_DAYS = 7;

const MEASUREMENTS_URL =
  `https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn-precip/${STATION_ABBR}` +
  `/ogd-smn-precip_${STATION_ABBR}_d_recent.csv`;
const FORECAST_COLLECTION_URL =
  "https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-local-forecasting";

/**
 * One hour, and the two sources agree on it for different reasons: the station
 * file is rewritten once a day, and the forecast publishes a new model run
 * every hour.
 */
const TTL_SECONDS = 60 * 60;
/** After a failed refresh, do not try again for this long. */
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

export type RainSource = "measured" | "forecast";
export type RainDay = { date: string; precipMm: number; source: RainSource };

function toDayKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

/**
 * The MeteoSchweiz files are ISO-8859-1, not UTF-8, so res.text() would mangle
 * the accented station and place names they carry.
 *
 * Buffer rather than TextDecoder because Bun types the latter to three
 * encodings, none of which is latin1.
 */
async function fetchLatin1(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer()).toString("latin1");
}

/**
 * Daily measurements for the station, keyed by day.
 *
 * `rka150d0` is the 0-to-0 UTC total, which lines up with a calendar day to
 * within the Swiss UTC offset. The file's other column, `rre150d0`, is a
 * 06-to-06 UTC total and would be six hours out.
 *
 * Exported so it can be driven against a saved file instead of the network.
 */
export function parseMeasurements(text: string): Map<string, number> {
  const byDay = new Map<string, number>();
  const prefix = `${STATION_ABBR.toUpperCase()};`;

  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(prefix)) {
      continue;
    }

    const parts = line.split(";");
    const timestamp = parts[1];
    const value = parts[3];
    if (timestamp === undefined || value === undefined) {
      continue;
    }

    // Fixed-width `dd.mm.yyyy HH:MM`, sliced rather than parsed: new Date()
    // would read it as UTC and could move the day.
    if (timestamp.length < 10) {
      continue;
    }
    const dayKey = `${timestamp.slice(6, 10)}-${timestamp.slice(3, 5)}-${timestamp.slice(0, 2)}`;

    // Blank during a station outage. A missing day is not a dry day, so it gets
    // no entry at all rather than a zero.
    const precipMm = Number(value.trim());
    if (value.trim() === "" || !Number.isFinite(precipMm)) {
      continue;
    }

    byDay.set(dayKey, precipMm);
  }

  return byDay;
}

/**
 * Daily forecast for our one point, keyed by day.
 *
 * The file holds every forecast point in Switzerland -- around 50 000 lines --
 * so the point is matched on the raw line before anything is split.
 *
 * Exported for the same reason as parseMeasurements.
 */
export function parseForecast(text: string): Map<string, number> {
  const byDay = new Map<string, number>();
  const prefix = `${FORECAST_POINT_ID};`;

  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(prefix)) {
      continue;
    }

    const parts = line.split(";");
    const stamp = parts[2];
    const value = parts[3];
    if (stamp === undefined || value === undefined || stamp.length < 8) {
      continue;
    }

    const dayKey = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;

    const precipMm = Number(value.trim());
    if (value.trim() === "" || !Number.isFinite(precipMm)) {
      continue;
    }

    byDay.set(dayKey, precipMm);
  }

  return byDay;
}

// Only the shape this module relies on. Zod rather than a cast, so a rename on
// the MeteoSchweiz side fails with a readable message in the log.
const stacItemSchema = z.object({
  assets: z.record(z.string(), z.object({ href: z.string() })),
});

/**
 * The newest model run for our parameter.
 *
 * A day's STAC item accumulates one asset per hour (`...0000` through
 * `...2300`). The keys are fixed-width, so sorting them as strings is sorting
 * them by time.
 */
async function latestForecastUrl() {
  const itemId = `${toDayKey(startOfToday()).replaceAll("-", "")}-ch`;
  const response = await fetch(`${FORECAST_COLLECTION_URL}/items/${itemId}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`STAC item ${itemId} answered ${response.status}`);
  }

  const item = stacItemSchema.parse(await response.json());
  const runs = Object.keys(item.assets)
    .filter((key) => key.endsWith(`.${FORECAST_PARAM}.csv`))
    .sort();

  const newest = runs.at(-1);
  if (!newest) {
    throw new Error(`STAC item ${itemId} has no ${FORECAST_PARAM} asset`);
  }

  return item.assets[newest]!.href;
}

/**
 * Fetch both sources and write what they agree to cover into the table.
 *
 * allSettled rather than all: a station outage should still let the forecast
 * land, and the other way round.
 */
async function refresh() {
  const [measured, forecast] = await Promise.allSettled([
    fetchLatin1(MEASUREMENTS_URL).then(parseMeasurements),
    latestForecastUrl().then(fetchLatin1).then(parseForecast),
  ]);

  if (measured.status === "rejected" && forecast.status === "rejected") {
    throw new Error(String(measured.reason));
  }

  const today = startOfToday();
  const todayKey = toDayKey(today);
  const lastForecastKey = toDayKey(addDays(today, FORECAST_DAYS));

  const rows: { date: string; precipMm: number; source: RainSource }[] = [];

  // The windows are spelled out rather than letting one source overwrite the
  // other, so the rule stays readable: measurements for days that are over,
  // forecast for today and the next FORECAST_DAYS. Day keys are `YYYY-MM-DD`,
  // so a plain string compare orders them.
  if (measured.status === "fulfilled") {
    for (const [date, precipMm] of measured.value) {
      if (date < todayKey) {
        rows.push({ date, precipMm, source: "measured" });
      }
    }
  }

  if (forecast.status === "fulfilled") {
    for (const [date, precipMm] of forecast.value) {
      if (date >= todayKey && date <= lastForecastKey) {
        rows.push({ date, precipMm, source: "forecast" });
      }
    }
  }

  if (rows.length === 0) {
    return;
  }

  // fetchedAt is left to the column default and to now() below, so the
  // freshness clock is the database's throughout. Handing it a JS Date instead
  // would write the local wall time and read it back as UTC.
  //
  // A day written as a forecast becomes a measurement here once the station
  // publishes it, which is why source is in the update set too.
  await db
    .insert(weatherDays)
    .values(rows)
    .onDuplicateKeyUpdate({
      set: {
        precipMm: sql`values(${weatherDays.precipMm})`,
        source: sql`values(${weatherDays.source})`,
        fetchedAt: sql`now()`,
      },
    });
}

// The two things the table cannot hold for us. Without the first, ten
// simultaneous page loads download the forecast ten times; without the second,
// an unreachable MeteoSchweiz costs every request the full fetch timeout.
let inFlight: Promise<void> | null = null;
let lastFailureAt = 0;

/**
 * How long ago each source was last written, in seconds.
 *
 * The subtraction happens inside the database on purpose. mysql2 hands back a
 * bare `max(fetched_at)` as a naive string, which JS parses as local time,
 * while the same column read through the schema decodes as UTC -- the two
 * disagree by the local offset, which is enough to make every row look an hour
 * or two old and refetch on every request.
 */
async function sourceAgesSeconds() {
  return db
    .select({
      source: weatherDays.source,
      ageSeconds: sql<number>`timestampdiff(second, max(${weatherDays.fetchedAt}), now())`,
    })
    .from(weatherDays)
    .groupBy(weatherDays.source);
}

/** True when either source is missing from the table or older than the TTL. */
async function isStale() {
  const ages = await sourceAgesSeconds();

  if (ages.length < 2) {
    return true;
  }

  return ages.some((age) => Number(age.ageSeconds) > TTL_SECONDS);
}

async function refreshIfStale() {
  if (inFlight) {
    return inFlight;
  }

  if (Date.now() - lastFailureAt < FAILURE_BACKOFF_MS) {
    return;
  }

  if (!(await isStale())) {
    return;
  }

  inFlight = refresh()
    .catch((error: unknown) => {
      // Once per refresh, not once per request. The page below serves whatever
      // is already in the table.
      lastFailureAt = Date.now();
      console.error("Wetterdaten konnten nicht geladen werden:", error);
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Every cached day with its rainfall, refreshing from MeteoSchweiz first if the
 * table has gone stale.
 *
 * On a failed refresh the rows already in the table are served with no age
 * limit: a stale row's worst case is a day that is missing, never one that is
 * wrong.
 */
export async function getRainDays(): Promise<{
  days: RainDay[];
  /** Age of the stalest source in seconds, or null when the table is empty. */
  ageSeconds: number | null;
}> {
  await refreshIfStale();

  const [rows, ages] = await Promise.all([
    db
      .select({
        date: weatherDays.date,
        precipMm: weatherDays.precipMm,
        source: weatherDays.source,
      })
      .from(weatherDays)
      .orderBy(weatherDays.date),
    sourceAgesSeconds(),
  ]);

  return {
    days: rows,
    ageSeconds:
      ages.length === 0
        ? null
        : Math.max(...ages.map((age) => Number(age.ageSeconds))),
  };
}
