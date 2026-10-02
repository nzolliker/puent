import { api } from '@/lib/api'

/** Everything in the ground right now, across all beds. */
export async function getCurrentPlantings() {
    const response = await api.plantings.$get()
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    const data = await response.json()
    return data
}

/** What has been cleared away from one bed. */
export async function getPlantingHistory(bedKey: string) {
    const response = await api.plantings.history.$get({ query: { bedKey } })
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    const data = await response.json()
    return data
}

export type Planting = Awaited<ReturnType<typeof getCurrentPlantings>>['plantings'][number]

export type PlantingInput = {
    cells: number[]
    crop: string
    note: string
    plantedAt: string
    /** Null means it is still growing. */
    removedAt: string | null
    photoId: number | null
}

/**
 * Unlike the other pages' fetchers this one reads the server's reason, because
 * here a refusal is something the gardener can act on -- "Dort wächst schon
 * etwas" -- rather than a fault.
 */
async function failure(response: { json(): Promise<unknown> }) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null

    return new Error(typeof body?.error === 'string' ? body.error : 'Speichern fehlgeschlagen')
}

export async function createPlanting(bedKey: string, input: PlantingInput) {
    const res = await api.plantings.$post({ json: { bedKey, ...input } })
    if (!res.ok) {
        throw await failure(res)
    }
}

/** Editing, clearing away and putting back are all this one call. */
export async function updatePlanting(id: number, patch: Partial<PlantingInput>) {
    const res = await api.plantings[':id{[0-9]+}'].$patch({
        param: { id: String(id) },
        json: patch,
    })
    if (!res.ok) {
        throw await failure(res)
    }
}

export async function deletePlanting(id: number) {
    const res = await api.plantings[':id{[0-9]+}'].$delete({ param: { id: String(id) } })
    if (!res.ok) {
        throw await failure(res)
    }
}

/**
 * Written out in pairs because Tailwind scans source text -- a class built by
 * string concatenation at runtime would never make it into the stylesheet.
 * `fill` is for the plan's cells, `dot` for the list beside it.
 */
const CROP_COLOURS = [
    { fill: 'fill-emerald-600', dot: 'bg-emerald-600' },
    { fill: 'fill-amber-600', dot: 'bg-amber-600' },
    { fill: 'fill-rose-600', dot: 'bg-rose-600' },
    { fill: 'fill-sky-600', dot: 'bg-sky-600' },
    { fill: 'fill-violet-600', dot: 'bg-violet-600' },
    { fill: 'fill-lime-600', dot: 'bg-lime-600' },
    { fill: 'fill-orange-600', dot: 'bg-orange-600' },
    { fill: 'fill-teal-600', dot: 'bg-teal-600' },
] as const

/**
 * A colour per crop, worked out from its name, so tomatoes are the same colour
 * in every bed and on every phone without anything being stored. With eight
 * colours two crops will sometimes share one.
 */
export function cropColour(crop: string) {
    let hash = 0
    for (const char of crop.trim().toLowerCase()) {
        hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 9973
    }

    return CROP_COLOURS[hash % CROP_COLOURS.length]
}
