import { useId } from 'react'

import { bedBounds, bedCells, bedCentre, planViewBox } from '@server/garden/geometry'
import type { Bed, GardenLayout } from '@server/garden/schema'
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

/** One bed: its ground, its cells cut to its shape, and its edge on top. */
function BedGrid({ bed, clipId, selected }: { bed: Bed; clipId: string; selected?: boolean }) {
    return (
        <>
            <clipPath id={clipId}>
                <BedShape bed={bed} />
            </clipPath>
            <BedShape bed={bed} className="fill-muted" />
            <g clipPath={`url(#${clipId})`}>
                {bedCells(bed).map((cell) => (
                    <rect
                        key={cell.index}
                        x={cell.x}
                        y={cell.y}
                        width={cell.w}
                        height={cell.h}
                        vectorEffect="non-scaling-stroke"
                        className="fill-none stroke-muted-foreground/40"
                    />
                ))}
            </g>
            {/* Drawn last and unclipped: a clipped edge would lose half its width. */}
            <BedShape
                bed={bed}
                className={cn(
                    'fill-none group-focus-visible:stroke-ring',
                    selected ? 'stroke-primary stroke-2' : 'stroke-muted-foreground',
                )}
            />
        </>
    )
}

export function GardenMap({
    layout,
    selectedKey,
    onSelect,
    className,
}: {
    layout: GardenLayout
    selectedKey?: string
    onSelect: (key: string) => void
    className?: string
}) {
    const clipPrefix = useClipPrefix()
    const view = planViewBox(layout)
    // In metres like everything else, so the names scale with the plan.
    const fontSize = view.w / 34

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
                const [labelX, labelY] = bedCentre(bed)
                // A rough width, good enough to leave a name off rather than
                // let it spill over the neighbouring bed. The name is still on
                // the panel below once the bed is tapped.
                const nameFits = bed.name.length * fontSize * 0.6 <= bedBounds(bed).w

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
                        />
                        {nameFits && (
                            <text
                                x={labelX}
                                y={labelY}
                                fontSize={fontSize}
                                textAnchor="middle"
                                dominantBaseline="central"
                                className="pointer-events-none fill-foreground select-none"
                            >
                                {bed.name}
                            </text>
                        )}
                    </g>
                )
            })}
        </svg>
    )
}

/** A single bed, as large as the page allows, so its cells are big enough to tap. */
export function BedView({ bed, className }: { bed: Bed; className?: string }) {
    const clipPrefix = useClipPrefix()
    const bounds = bedBounds(bed)
    // Room for the edge, which is drawn half outside the shape.
    const pad = Math.max(bounds.w, bounds.h) * 0.03

    return (
        <svg
            viewBox={`${bounds.x - pad} ${bounds.y - pad} ${bounds.w + 2 * pad} ${bounds.h + 2 * pad}`}
            className={cn('max-h-56 w-full', className)}
            role="img"
            aria-label={bed.name}
        >
            <BedGrid bed={bed} clipId={`${clipPrefix}-${bed.key}`} />
        </svg>
    )
}
