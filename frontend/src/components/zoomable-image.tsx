import { useEffect, useRef, useState } from 'react'
import type { ImgHTMLAttributes, PointerEvent as ReactPointerEvent } from 'react'

import { cn } from '@/lib/utils'

/** How far in a photo goes. */
const MAX_SCALE = 5
/** Where a double tap takes it. */
const DOUBLE_TAP_SCALE = 2.5
/** Two taps closer than this, in time and in pixels, are a double tap. */
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_SLOP = 25
/** A pointer that moved further than this, in pixels, was a drag, not a tap. */
const TAP_SLOP = 6

/**
 * Scale, and where the image's top-left corner sits, in pixels of its frame.
 * The transform origin is the corner, so a point `c` of the image is drawn at
 * `t + c * scale`.
 */
type View = { scale: number; x: number; y: number }

const IDENTITY: View = { scale: 1, x: 0, y: 0 }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Keeps the zoom in range and the frame covered: no panning past an edge. */
function clampView(view: View, width: number, height: number): View {
    const scale = clamp(view.scale, 1, MAX_SCALE)

    return {
        scale,
        x: clamp(view.x, width - width * scale, 0),
        y: clamp(view.y, height - height * scale, 0),
    }
}

/** Zooms by `factor` around a point of the frame, which stays where it is. */
function zoomAround(view: View, factor: number, px: number, py: number, width: number, height: number): View {
    const scale = clamp(view.scale * factor, 1, MAX_SCALE)
    const cx = (px - view.x) / view.scale
    const cy = (py - view.y) / view.scale

    return clampView({ scale, x: px - cx * scale, y: py - cy * scale }, width, height)
}

/**
 * A photo that can be looked at closely: pinch to zoom and drag to move on a
 * phone, a double tap to go in and back out, a trackpad pinch or ctrl and the
 * wheel on a computer. Only the photo grows; the page around it stays put.
 *
 * Starts at full view each time it is mounted, which in a dialog is each time
 * the dialog opens.
 */
export function ZoomableImage({ className, ...img }: ImgHTMLAttributes<HTMLImageElement>) {
    const frameRef = useRef<HTMLDivElement>(null)
    const [view, setViewState] = useState<View>(IDENTITY)
    // Mirrored, so that several pointer events between two renders build on
    // each other instead of on the same stale state.
    const viewRef = useRef(view)
    const setView = (next: View) => {
        viewRef.current = next
        setViewState(next)
    }

    const frame = () => frameRef.current!.getBoundingClientRect()

    const gesture = useRef({
        pointers: new Map<number, { x: number; y: number }>(),
        travelled: 0,
        multiTouch: false,
        lastTap: { time: 0, x: 0, y: 0 },
    })

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        const g = gesture.current
        if (g.pointers.size === 0) {
            g.travelled = 0
            g.multiTouch = false
        } else {
            g.multiTouch = true
        }
        g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
        frameRef.current?.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        const g = gesture.current
        const last = g.pointers.get(event.pointerId)
        if (!last) return

        const current = { x: event.clientX, y: event.clientY }
        const others = [...g.pointers].filter(([id]) => id !== event.pointerId).map(([, point]) => point)
        const box = frame()

        g.travelled += Math.hypot(current.x - last.x, current.y - last.y)

        if (others.length === 1) {
            // Pinch: the gap between the fingers is the zoom, and the point
            // between them carries the photo along.
            const other = others[0]!
            const before = Math.hypot(last.x - other.x, last.y - other.y)
            const factor = before > 0 ? Math.hypot(current.x - other.x, current.y - other.y) / before : 1
            const panned = {
                ...viewRef.current,
                x: viewRef.current.x + (current.x - last.x) / 2,
                y: viewRef.current.y + (current.y - last.y) / 2,
            }
            const middleX = (current.x + other.x) / 2 - box.left
            const middleY = (current.y + other.y) / 2 - box.top
            setView(zoomAround(panned, factor, middleX, middleY, box.width, box.height))
        } else if (others.length === 0 && viewRef.current.scale > 1) {
            setView(
                clampView(
                    {
                        ...viewRef.current,
                        x: viewRef.current.x + current.x - last.x,
                        y: viewRef.current.y + current.y - last.y,
                    },
                    box.width,
                    box.height,
                ),
            )
        }

        g.pointers.set(event.pointerId, current)
    }

    const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        const g = gesture.current
        g.pointers.delete(event.pointerId)
        if (g.pointers.size > 0 || g.multiTouch || g.travelled > TAP_SLOP) return

        // A tap. The second of two close together toggles the zoom.
        const now = event.timeStamp
        const { lastTap } = g
        const isDouble =
            now - lastTap.time < DOUBLE_TAP_MS &&
            Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < DOUBLE_TAP_SLOP

        if (!isDouble) {
            g.lastTap = { time: now, x: event.clientX, y: event.clientY }
            return
        }

        g.lastTap = { time: 0, x: 0, y: 0 }
        if (viewRef.current.scale > 1) {
            setView(IDENTITY)
        } else {
            const box = frame()
            setView(
                zoomAround(
                    viewRef.current,
                    DOUBLE_TAP_SCALE,
                    event.clientX - box.left,
                    event.clientY - box.top,
                    box.width,
                    box.height,
                ),
            )
        }
    }

    const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
        gesture.current.pointers.delete(event.pointerId)
    }

    // A trackpad pinch arrives as a wheel with ctrl held. Not passive, or it
    // could not keep the browser from zooming the whole page instead.
    useEffect(() => {
        const element = frameRef.current
        if (!element) return

        const onWheel = (event: WheelEvent) => {
            if (!event.ctrlKey) return
            event.preventDefault()

            const box = element.getBoundingClientRect()
            setView(
                zoomAround(
                    viewRef.current,
                    Math.exp(-event.deltaY * 0.01),
                    event.clientX - box.left,
                    event.clientY - box.top,
                    box.width,
                    box.height,
                ),
            )
        }

        element.addEventListener('wheel', onWheel, { passive: false })
        return () => element.removeEventListener('wheel', onWheel)
    }, [])

    return (
        <div
            ref={frameRef}
            // The gestures are the photo's, not the page's.
            className="touch-none overflow-hidden rounded-md select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
        >
            <img
                {...img}
                draggable={false}
                style={{
                    transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                    transformOrigin: '0 0',
                }}
                className={cn('block', view.scale > 1 ? 'cursor-grab' : 'cursor-zoom-in', className)}
            />
        </div>
    )
}
