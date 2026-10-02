import { createFileRoute } from '@tanstack/react-router'

import { BedView, GardenMap } from '@/components/garden-map'
import { bedCells } from '@server/garden/geometry'
import { findBed, gardenLayout } from '@server/garden/layout'

type BeeteSearch = {
    /** The bed whose panel is open, by its key, so a link can point at one bed. */
    beet?: string
}

export const Route = createFileRoute('/beete')({
    component: Beete,
    validateSearch: (search: Record<string, unknown>): BeeteSearch => {
        const beet = typeof search.beet === 'string' ? search.beet : undefined

        // A key that is not on the plan is dropped, so a link to a bed that
        // has since been removed opens the plan rather than an empty panel.
        return beet && findBed(beet) ? { beet } : {}
    },
})

function Beete() {
    const navigate = Route.useNavigate()
    const { beet } = Route.useSearch()
    const bed = beet ? findBed(beet) : undefined

    return (
        <div className="mx-auto max-w-2xl p-2">
            <h1 className="px-1 text-xl font-bold">Beete</h1>

            <div className="mt-3 rounded-lg border p-1">
                <GardenMap
                    layout={gardenLayout}
                    selectedKey={bed?.key}
                    // Tapping the open bed again closes it.
                    onSelect={(key) =>
                        void navigate({ search: key === bed?.key ? {} : { beet: key }, replace: true })
                    }
                />
            </div>

            {bed ? (
                <div className="mt-3 rounded-lg border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                        <h2 className="font-semibold">{bed.name}</h2>
                        <span className="text-xs text-muted-foreground">
                            {bedCells(bed).length === 1 ? '1 Feld' : `${bedCells(bed).length} Felder`}
                        </span>
                    </div>
                    <BedView bed={bed} className="mt-3" />
                </div>
            ) : (
                <p className="mt-3 px-1 text-sm text-muted-foreground">
                    Ein Beet antippen, um es zu öffnen.
                </p>
            )}
        </div>
    )
}
