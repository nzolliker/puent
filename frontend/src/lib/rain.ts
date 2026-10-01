import { api } from '@/lib/api'

/** Measured for days that are over, forecast for today and the next few. */
export type RainSource = 'measured' | 'forecast'

/**
 * Every day it rained, with the server's default threshold alongside.
 *
 * Deliberately not parameterised: the response covers all dates and all
 * thresholds, so the calendar can page to another month, or the threshold be
 * dragged, without ever asking again.
 */
export async function getRainDays() {
    const response = await api['water-plants'].rain.$get()
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    const data = await response.json()
    return data
}

/**
 * Rain on a day nobody signed up for. The lighter blue is the forecast, so an
 * expected rain day never looks like something that already happened.
 */
export const RAIN_OPEN = {
    measured: 'bg-sky-400 text-sky-950',
    forecast: 'bg-sky-200 text-sky-950',
} as const

/**
 * Rain on a day somebody signed up for: green and blue split along the
 * diagonal. Two stops both at 50% are what make it a line rather than a fade,
 * and 135deg puts green top-left under the date, blue bottom-right.
 *
 * Written out per source because Tailwind scans source text -- a colour built
 * by string concatenation at runtime would never make it into the stylesheet.
 */
export const RAIN_BOOKED = {
    measured:
        'bg-[image:linear-gradient(135deg,var(--color-green-400)_50%,var(--color-sky-400)_50%)] text-emerald-950',
    forecast:
        'bg-[image:linear-gradient(135deg,var(--color-green-400)_50%,var(--color-sky-200)_50%)] text-emerald-950',
} as const

/** A booked day with no rain: the green the calendar has always used. */
export const BOOKED_DRY = 'bg-green-400 text-emerald-900'

/**
 * The amount, for the calendar cell that would otherwise hold a name.
 *
 * A trailing ".0" reads like false precision in a 44px cell, and a decimal on a
 * big number is noise, so: 4.9 mm, 13 mm.
 */
export function formatMm(mm: number) {
    const rounded = mm >= 10 ? Math.round(mm) : Math.round(mm * 10) / 10
    return `${rounded} mm`
}

/** "Regen" once it is measured, "Regen?" while it is still a forecast. */
export function rainLabel(source: RainSource) {
    return source === 'forecast' ? 'Regen?' : 'Regen'
}
