import { useId } from 'react'
import type { KeyboardEvent } from 'react'

import { bedBounds, bedCells, labelSlot, planViewBox } from '@server/garden/geometry'
import type { Bed, GardenLayout } from '@server/garden/schema'
import { plantingColour } from '@/lib/beds'
import { cn } from '@/lib/utils'

/**
 * The plan of the garden, drawn from server/garden/layout.ts.
 *
 * The SVG's user units are the layout's metres, so nothing here converts a
 * coordinate. Line widths are the exception: `non-scaling-stroke` keeps them
 * in screen pixels, or a 1 px line would be a metre wide.
 */

function BedShape({ bed, className }: { bed: Bed; className?: string }) {
    const props = { className, vectorEffect: 'non-scaling-stroke' } as const

    switch (bed.shape) {
        case 'rect':
            return <rect x={bed.x} y={bed.y} width={bed.w} height={bed.h} {...props} />
        case 'circle':
            return <circle cx={bed.cx} cy={bed.cy} r={bed.r} {...props} />
        case 'polygon':
            return <polygon points={bed.points.map((point) => point.join(',')).join(' ')} {...props} />
    }
}

/**
 * useId hands out ids with characters that are not safe inside `url(#...)`,
 * which is the only place these are used.
 */
function useClipPrefix() {
    return useId().replace(/[^a-zA-Z0-9_-]/g, '')
}

/** Makes the cells of a bed tappable, for choosing where a planting goes. */
export type CellPicker = {
    selected: number[]
    /** Cells something else is growing in. Shown, but not for the taking. */
    disabled: number[]
    onToggle: (index: number) => void
}

/** What the plan needs to know about a planting. A Planting from lib/beds fits. */
export type MapPlanting = {
    id: number
    bedKey: string
    cells: number[]
    crop: string
    readyAt?: string | null
    removedAt?: string | null
}

/**
 * A name cut to the room it has. The width of a letter is a guess -- there is
 * no measuring text before it is drawn -- so it errs on the side of cutting.
 * Under three letters a name says nothing, and is left off instead.
 */
function fitText(text: string, width: number, fontSize: number) {
    const room = Math.floor((width * 0.95) / (fontSize * 0.6))

    if (text.length <= room) return text
    return room >= 3 ? `${text.slice(0, room - 1)}…` : null
}

/** One bed: its ground, its cells cut to its shape, and its edge on top. */
function BedGrid({
    bed,
    clipId,
    selected,
    plantings = [],
    ghost,
    fontSize,
    picker,
}: {
    bed: Bed
    clipId: string
    selected?: boolean
    /** The plantings of this bed to draw: their cells coloured and named. */
    plantings?: MapPlanting[]
    /** Draws them faded, for something that is no longer in the ground. */
    ghost?: boolean
    /** For the names, in the SVG's own units. */
    fontSize: number
    picker?: CellPicker
}) {
    return (
        <>
            <clipPath id={clipId}>
                <BedShape bed={bed} />
            </clipPath>
            <BedShape bed={bed} className="fill-muted" />
            <g clipPath={`url(#${clipId})`}>
                {bedCells(bed).map((cell, position) => {
                    const isSelected = picker?.selected.includes(cell.index) ?? false
                    const isDisabled = picker?.disabled.includes(cell.index) ?? false
                    const planting = plantings.find((p) => p.cells.includes(cell.index))
                    const toggle = () => {
                        if (!isDisabled) picker?.onToggle(cell.index)
                    }

                    return (
                        <rect
                            key={cell.index}
                            x={cell.x}
                            y={cell.y}
                            width={cell.w}
                            height={cell.h}
                            vectorEffect="non-scaling-stroke"
                            className={cn(
                                'stroke-muted-foreground/40',
                                // Transparent rather than none: a cell with no
                                // fill does not receive the tap.
                                isSelected
                                    ? 'fill-primary'
                                    : planting
                                      ? cn(plantingColour(planting), ghost && 'opacity-50')
                                      : 'fill-transparent',
                                picker && (isDisabled ? 'opacity-40' : 'cursor-pointer'),
                            )}
                            {...(picker && {
                                role: 'button',
                                tabIndex: isDisabled ? -1 : 0,
                                'aria-label': `Feld ${position + 1}`,
                                'aria-pressed': isSelected,
                                'aria-disabled': isDisabled,
                                onClick: toggle,
                                onKeyDown: (event: KeyboardEvent<SVGRectElement>) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault()
                                        toggle()
                                    }
                                },
                            })}
                        />
                    )
                })}
            </g>
            {/* Drawn last and unclipped: a clipped edge would lose half its width. */}
            <BedShape
                bed={bed}
                className={cn(
                    'pointer-events-none fill-none group-focus-visible:stroke-ring',
                    selected ? 'stroke-primary stroke-2' : 'stroke-muted-foreground',
                )}
            />
            {plantings.map((planting) => {
                const slot = labelSlot(bed, planting.cells)
                if (!slot || slot.h < fontSize * 1.1) return null

                const name = fitText(planting.crop, slot.w, fontSize)
                if (!name) return null

                return (
                    // White with a dark edge, so it reads on every crop
                    // colour. The edge is in the SVG's units on purpose --
                    // it has to scale with the letters.
                    <text
                        key={planting.id}
                        x={slot.x + slot.w / 2}
                        y={slot.y + slot.h / 2}
                        fontSize={fontSize}
                        textAnchor="middle"
                        dominantBaseline="central"
                        strokeWidth={fontSize * 0.18}
                        strokeLinejoin="round"
                        paintOrder="stroke"
                        className="pointer-events-none fill-white stroke-black/50 select-none"
                    >
                        {name}
                    </text>
                )
            })}
        </>
    )
}

export function GardenMap({
    layout,
    selectedKey,
    onSelect,
    plantings = [],
    className,
}: {
    layout: GardenLayout
    selectedKey?: string
    onSelect: (key: string) => void
    /** What is growing, across all beds. */
    plantings?: MapPlanting[]
    className?: string
}) {
    const clipPrefix = useClipPrefix()
    const view = planViewBox(layout)
    // In metres like everything else, so the names scale with the plan.
    const cropSize = view.w / 38
    const captionSize = view.w / 42

    return (
        <svg
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            className={cn('h-auto w-full', className)}
            role="group"
            aria-label="Lageplan"
        >
            <polygon
                points={layout.outline.map((point) => point.join(',')).join(' ')}
                vectorEffect="non-scaling-stroke"
                className="fill-card stroke-border"
            />
            {layout.beds.map((bed) => {
                const bounds = bedBounds(bed)

                return (
                    <g
                        key={bed.key}
                        role="button"
                        tabIndex={0}
                        aria-label={bed.name}
                        aria-pressed={bed.key === selectedKey}
                        className="group cursor-pointer outline-none"
                        onClick={() => onSelect(bed.key)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                onSelect(bed.key)
                            }
                        }}
                    >
                        <title>{bed.name}</title>
                        <BedGrid
                            bed={bed}
                            clipId={`${clipPrefix}-${bed.key}`}
                            selected={bed.key === selectedKey}
                            plantings={plantings.filter((planting) => planting.bedKey === bed.key)}
                            fontSize={cropSize}
                        />
                        {/* Above the bed, because the inside belongs to
                            what is growing there. */}
                        <text
                            x={bounds.x + bounds.w / 2}
                            y={bounds.y - captionSize * 0.45}
                            fontSize={captionSize}
                            textAnchor="middle"
                            className={cn(
                                'pointer-events-none select-none',
                                bed.key === selectedKey ? 'fill-foreground' : 'fill-muted-foreground',
                            )}
                        >
                            {bed.name}
                        </text>
                    </g>
                )
            })}
        </svg>
    )
}

/**
 * How tall the enlarged bed may get, in pixels. Matches `max-h-56` below; the
 * names are sized from it.
 */
const BED_VIEW_MAX_HEIGHT = 224
/** The widest it gets on a phone, roughly -- enough to size the names by. */
const BED_VIEW_WIDTH = 340

/** A single bed, as large as the page allows, so its cells are big enough to tap. */
export function BedView({
    bed,
    plantings,
    ghost,
    picker,
    className,
}: {
    bed: Bed
    plantings?: MapPlanting[]
    ghost?: boolean
    picker?: CellPicker
    className?: string
}) {
    const clipPrefix = useClipPrefix()
    const bounds = bedBounds(bed)
    // Room for the edge, which is drawn half outside the shape.
    const pad = Math.max(bounds.w, bounds.h) * 0.03
    const width = bounds.w + 2 * pad
    const height = bounds.h + 2 * pad
    // The bed is scaled to fit the box, so whichever side is the tighter one
    // decides how many metres a pixel is -- and 13 of those is the letter size.
    const fontSize = 13 * Math.max(width / BED_VIEW_WIDTH, height / BED_VIEW_MAX_HEIGHT)

    return (
        <svg
            viewBox={`${bounds.x - pad} ${bounds.y - pad} ${width} ${height}`}
            className={cn('max-h-56 w-full', className)}
            role={picker ? 'group' : 'img'}
            aria-label={bed.name}
        >
            <BedGrid
                bed={bed}
                clipId={`${clipPrefix}-${bed.key}`}
                plantings={plantings}
                ghost={ghost}
                fontSize={fontSize}
                picker={picker}
            />
        </svg>
    )
}

/**
 * The bed in miniature with one planting's cells filled in: where in the bed
 * it is, or was. No grid lines -- at this size they would be all there is.
 */
export function BedThumb({
    bed,
    cells,
    colourClass,
    className,
}: {
    bed: Bed
    cells: number[]
    colourClass: string
    className?: string
}) {
    const clipId = `${useClipPrefix()}-thumb`
    const bounds = bedBounds(bed)
    const pad = Math.max(bounds.w, bounds.h) * 0.05

    return (
        <svg
            viewBox={`${bounds.x - pad} ${bounds.y - pad} ${bounds.w + 2 * pad} ${bounds.h + 2 * pad}`}
            className={cn('size-9 shrink-0', className)}
            aria-hidden
        >
            <clipPath id={clipId}>
                <BedShape bed={bed} />
            </clipPath>
            <BedShape bed={bed} className="fill-muted" />
            <g clipPath={`url(#${clipId})`}>
                {bedCells(bed)
                    .filter((cell) => cells.includes(cell.index))
                    .map((cell) => (
                        <rect
                            key={cell.index}
                            x={cell.x}
                            y={cell.y}
                            width={cell.w}
                            height={cell.h}
                            className={colourClass}
                        />
                    ))}
            </g>
            <BedShape bed={bed} className="fill-none stroke-muted-foreground" />
        </svg>
    )
}
