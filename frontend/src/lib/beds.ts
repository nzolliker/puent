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
    /** Since when it can be harvested. Left out, it stays as it is. */
    readyAt?: string | null
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
 * Whether a planting can be picked today. One that has been cleared away
 * keeps the day it ripened, but there is nothing left of it to pick.
 */
export function isReady(planting: { readyAt?: string | null; removedAt?: string | null }) {
    return Boolean(planting.readyAt) && !planting.removedAt
}

/** The one green on the plan: this can be harvested. */
const READY_FILL = 'fill-green-500'

/**
 * Everything else. Subdued on purpose and with no green among them, so that
 * nothing on the plan competes with what is ready. Still more than one tone,
 * because two crops side by side have to be told apart.
 *
 * Written out in full because Tailwind scans source text -- a class built by
 * string concatenation at runtime would never make it into the stylesheet.
 */
const PLAIN_FILLS = [
    'fill-slate-500',
    'fill-stone-500',
    'fill-sky-900',
    'fill-indigo-900',
    'fill-violet-900',
    'fill-rose-900',
    'fill-orange-900',
    'fill-amber-900',
] as const

/**
 * The fill of a planting's cells. The tone comes from the crop's name, so
 * tomatoes look the same in every bed and on every phone without anything
 * being stored; with eight tones two crops will sometimes share one.
 */
export function plantingColour(planting: {
    crop: string
    readyAt?: string | null
    removedAt?: string | null
}) {
    if (isReady(planting)) {
        return READY_FILL
    }

    let hash = 0
    for (const char of planting.crop.trim().toLowerCase()) {
        hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 9973
    }

    return PLAIN_FILLS[hash % PLAIN_FILLS.length]
}
