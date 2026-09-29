import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? ''
}

/** Parses a `YYYY-MM-DD` day key from the API into a local-time Date. */
export function dayKeyToDate(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * The inverse: a Date as the `YYYY-MM-DD` the API stores.
 *
 * Built from the local parts on purpose. `toISOString()` would convert to UTC
 * first, so an evening in Zurich comes back as the day before.
 */
export function toLocalDayKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function formatWeekday(value: Date) {
  return new Intl.DateTimeFormat('de-CH', { weekday: 'short' }).format(value)
}
