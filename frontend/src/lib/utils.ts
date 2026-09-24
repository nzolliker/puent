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

export function formatWeekday(value: Date) {
  return new Intl.DateTimeFormat('de-CH', { weekday: 'short' }).format(value)
}
