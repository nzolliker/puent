import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'

import { bedBounds, bedCells, labelSlot, planViewBox, plantingOutline } from '@server/garden/geometry'
import type { Rect } from '@server/garden/geometry'
import type { Bed, GardenLayout } from '@server/garden/schema'
import { Button } from '@/components/ui/button'
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
                                'stroke-muted-foreground/20',
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
                {/* Around each planting, so two crops side by side are told
                    apart by the edge between them rather than by colour.
                    Inside the clip, so it follows a round bed's edge. */}
                {plantings.map((planting) => (
                    <path
                        key={planting.id}
                        d={plantingOutline(bed, planting.cells)}
                        vectorEffect="non-scaling-stroke"
                        strokeWidth={1.5}
                        strokeLinecap="square"
                        className={cn('pointer-events-none fill-none stroke-foreground/70', ghost && 'opacity-50')}
                    />
                ))}
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
                    // Dark with an edge in the page's colour, so it reads on
                    // the pale tones and on the green alike. The edge is in
                    // the SVG's units on purpose -- it has to scale with the
                    // letters.
                    <text
                        key={planting.id}
                        x={slot.x + slot.w / 2}
                        y={slot.y + slot.h / 2}
                        fontSize={fontSize}
                        textAnchor="middle"
                        dominantBaseline="central"
                        strokeWidth={fontSize * 0.22}
                        strokeLinejoin="round"
                        paintOrder="stroke"
                        className="pointer-events-none fill-foreground stroke-background/80 select-none"
                    >
                        {name}
                    </text>
                )
            })}
        </>
    )
}

/** How far in the plan goes: a sixth of it fills the screen. */
const MAX_SCALE = 6
/** What one tap on + or − does. */
const STEP = 1.5
/** A pointer that moved further than this, in pixels, was a drag, not a tap. */
const TAP_SLOP = 6

/** How far in, and which point of the plan is in the middle. In metres. */
type Zoom = { scale: number; cx: number; cy: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Keeps the zoom in range and the visible part on the plan. */
function clampZoom(view: Rect, zoom: Zoom): Zoom {
    const scale = clamp(zoom.scale, 1, MAX_SCALE)
    const halfW = view.w / scale / 2
    const halfH = view.h / scale / 2

    return {
        scale,
        cx: clamp(zoom.cx, view.x + halfW, view.x + view.w - halfW),
        cy: clamp(zoom.cy, view.y + halfH, view.y + view.h - halfH),
    }
}

function visibleRect(view: Rect, zoom: Zoom): Rect {
    const w = view.w / zoom.scale
    const h = view.h / zoom.scale

    return { x: zoom.cx - w / 2, y: zoom.cy - h / 2, w, h }
}

/**
 * Zooms by `factor` around a point of the plan, which stays where it is on
 * the screen -- the point between the fingers, or under the cursor.
 */
function zoomAround(view: Rect, zoom: Zoom, factor: number, x: number, y: number): Zoom {
    const before = visibleRect(view, zoom)
    const scale = clamp(zoom.scale * factor, 1, MAX_SCALE)
    const w = view.w / scale
    const h = view.h / scale
    const left = x - ((x - before.x) / before.w) * w
    const top = y - ((y - before.y) / before.h) * h

    return clampZoom(view, { scale, cx: left + w / 2, cy: top + h / 2 })
}

/**
 * The plan of the garden, zoomable: pinch and drag on a phone, the wheel or a
 * trackpad pinch on a computer, and buttons for either.
 *
 * The zoom changes the viewBox rather than scaling the picture, so the lines
 * stay sharp and the letters stay the same size on screen. Zoomed in, a name
 * has more room and is no longer cut short.
 */
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
    const svgRef = useRef<SVGSVGElement>(null)

    const [zoom, setZoomState] = useState<Zoom>(() => ({
        scale: 1,
        cx: view.x + view.w / 2,
        cy: view.y + view.h / 2,
    }))
    // Mirrored, so that several pointer events between two renders build on
    // each other instead of on the same stale state.
    const zoomRef = useRef(zoom)
    const setZoom = (next: Zoom) => {
        zoomRef.current = next
        setZoomState(next)
    }

    const visible = visibleRect(view, zoom)
    // In metres like everything else, so at scale 1 the names are as large
    // as they always were, and stay that size on screen when zoomed.
    const cropSize = view.w / 38 / zoom.scale
    const captionSize = view.w / 42 / zoom.scale

    /** Where on the plan a point of the screen is. */
    const toPlan = (clientX: number, clientY: number) => {
        const box = svgRef.current!.getBoundingClientRect()
        const shown = visibleRect(view, zoomRef.current)

        return {
            x: shown.x + ((clientX - box.left) / box.width) * shown.w,
            y: shown.y + ((clientY - box.top) / box.height) * shown.h,
        }
    }
    /** How many metres one pixel is, at the current zoom. */
    const metresPerPixel = () => visibleRect(view, zoomRef.current).w / svgRef.current!.getBoundingClientRect().width

    const gesture = useRef({
        pointers: new Map<number, { x: number; y: number }>(),
        travelled: 0,
        /** Set once a gesture has moved far enough; the click after it is not a tap. */
        dragged: false,
    })

    const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
        const g = gesture.current
        if (g.pointers.size === 0) {
            g.travelled = 0
            g.dragged = false
        }
        g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }

    const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
        const g = gesture.current
        const last = g.pointers.get(event.pointerId)
        if (!last) return

        const current = { x: event.clientX, y: event.clientY }
        const others = [...g.pointers].filter(([id]) => id !== event.pointerId).map(([, point]) => point)

        g.travelled += Math.hypot(current.x - last.x, current.y - last.y)
        if (!g.dragged && g.travelled > TAP_SLOP) {
            g.dragged = true
            // Only now: captured from the start, the tap on a bed would land
            // on the plan instead of on the bed.
            svgRef.current?.setPointerCapture(event.pointerId)
        }

        if (others.length === 1) {
            // Pinch: the gap between the fingers is the zoom, and the point
            // between them moves the plan along with them.
            const other = others[0]!
            const factor = Math.hypot(current.x - other.x, current.y - other.y) / Math.hypot(last.x - other.x, last.y - other.y)
            const mpp = metresPerPixel()
            const panned = clampZoom(view, {
                ...zoomRef.current,
                cx: zoomRef.current.cx - ((current.x - last.x) / 2) * mpp,
                cy: zoomRef.current.cy - ((current.y - last.y) / 2) * mpp,
            })
            zoomRef.current = panned
            const middle = toPlan((current.x + other.x) / 2, (current.y + other.y) / 2)
            if (Number.isFinite(factor) && factor > 0) {
                setZoom(zoomAround(view, panned, factor, middle.x, middle.y))
            } else {
                setZoom(panned)
            }
        } else if (others.length === 0 && g.dragged && zoomRef.current.scale > 1) {
            const mpp = metresPerPixel()
            setZoom(
                clampZoom(view, {
                    ...zoomRef.current,
                    cx: zoomRef.current.cx - (current.x - last.x) * mpp,
                    cy: zoomRef.current.cy - (current.y - last.y) * mpp,
                }),
            )
        }

        g.pointers.set(event.pointerId, current)
    }

    const onPointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
        gesture.current.pointers.delete(event.pointerId)
    }

    // The wheel needs a listener that is not passive, or it cannot keep the
    // page from scrolling. Zoomed out, a plain wheel still scrolls the page;
    // a trackpad pinch (which arrives as a wheel with ctrl held) zooms.
    useEffect(() => {
        const svg = svgRef.current
        if (!svg) return

        const onWheel = (event: WheelEvent) => {
            if (!event.ctrlKey && zoomRef.current.scale === 1) return
            event.preventDefault()

            const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002))
            const point = toPlan(event.clientX, event.clientY)
            setZoom(zoomAround(view, zoomRef.current, factor, point.x, point.y))
        }

        svg.addEventListener('wheel', onWheel, { passive: false })
        return () => svg.removeEventListener('wheel', onWheel)
        // view comes from the layout, which does not change while mounted.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const zoomBy = (factor: number) => setZoom(zoomAround(view, zoomRef.current, factor, zoomRef.current.cx, zoomRef.current.cy))
    const reset = () => setZoom(clampZoom(view, { scale: 1, cx: 0, cy: 0 }))

    const select = (key: string) => {
        // The click that ends a drag or a pinch is not a tap on a bed.
        if (gesture.current.dragged) return
        onSelect(key)
    }

    return (
        <div className={cn('relative overflow-hidden', className)}>
            <svg
                ref={svgRef}
                viewBox={`${visible.x} ${visible.y} ${visible.w} ${visible.h}`}
                className="block h-auto w-full select-none"
                // Zoomed out, a finger still scrolls the page; zoomed in, it
                // moves the plan. Pinching is the plan's either way.
                style={{ touchAction: zoom.scale > 1 ? 'none' : 'pan-y' }}
                role="group"
                aria-label="Lageplan"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
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
                            onClick={() => select(bed.key)}
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
            {/* Bottom right, where the plot's slope leaves the plan empty. */}
            <div className="absolute right-1 bottom-1 flex gap-1">
                {zoom.scale > 1 && (
                    <Button variant="outline" size="icon" aria-label="Ganzen Plan zeigen" onClick={reset}>
                        <RotateCcw />
                    </Button>
                )}
                <Button
                    variant="outline"
                    size="icon"
                    aria-label="Verkleinern"
                    disabled={zoom.scale <= 1}
                    onClick={() => zoomBy(1 / STEP)}
                >
                    <Minus />
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    aria-label="Vergrössern"
                    disabled={zoom.scale >= MAX_SCALE}
                    onClick={() => zoomBy(STEP)}
                >
                    <Plus />
                </Button>
            </div>
        </div>
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
                {/* The tones are pale, so the edge is what shows where. */}
                <path
                    d={plantingOutline(bed, cells)}
                    vectorEffect="non-scaling-stroke"
                    className="fill-none stroke-foreground/70"
                />
            </g>
            <BedShape bed={bed} className="fill-none stroke-muted-foreground" />
        </svg>
    )
}
