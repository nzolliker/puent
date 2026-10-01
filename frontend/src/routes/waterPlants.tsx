import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, CalendarDayButton } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { cn, dayKeyToDate, getFirstName, toLocalDayKey } from '@/lib/utils'
import { api } from '@/lib/api'
import { Slider } from '@/components/ui/slider'
import {
    BOOKED_DRY,
    RAIN_BOOKED,
    RAIN_OPEN,
    formatMm,
    getRainDays,
    rainLabel,
} from '@/lib/rain'
import { ReadOnlyNotice } from '@/components/access'
import { useCanEdit, useSession } from '@/lib/auth'
import { createWaterFormSchema } from '@server/sharedTypes'

const dayKeyPattern = /^\d{4}-\d{2}-\d{2}$/

/**
 * Ceiling for the threshold slider. Covers any realistic daily total -- the API
 * still accepts up to 100, so a hand-written ?rain= beyond this keeps working
 * and merely pins the thumb at the end of the track.
 */
const SLIDER_MAX_MM = 20

type WaterSearch = {
    /** Preselects this day and opens the enroll dialog, e.g. from the dashboard card. */
    date?: string
    /**
     * Millimetres from which a day counts as rainy. Absent means the server's
     * default. It lives in the URL so a reload keeps it and a view can be shared,
     * the same way the photo album filter does.
     */
    rain?: number
}

export const Route = createFileRoute('/waterPlants')({
    component: Giessen,
    validateSearch: (search: Record<string, unknown>): WaterSearch => {
        const date = search.date
        const rain = Number(search.rain)

        return {
            ...(typeof date === 'string' && dayKeyPattern.test(date) ? { date } : {}),
            // Same defensive read as the date: anything that is not a sensible
            // number is dropped rather than passed on to the API.
            ...(search.rain !== undefined && Number.isFinite(rain) && rain >= 0 && rain <= 100
                ? { rain }
                : {}),
        }
    },
})

type WaterFormValues = {
    date: Date | null
}

type WaterFormApi = ReturnType<typeof useWaterForm>

type WaterDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    pickedDate: Date
    form: WaterFormApi
}

type WaterBooking = {
    id: number
    date: Date
    dayKey: string
    name: string
    /** Null on the rows that predate the login -- those belong to nobody. */
    userId: number | null
}

type RemoveDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    pickedDate: Date
    isPending: boolean
    onConfirm: () => void
}

function formatPickedDate(value: Date) {
    return new Intl.DateTimeFormat('de-CH', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(value)
}

// No name in the payload: the server reads it off the session.
async function handleEnroll(value: { date: Date }) {
    const res = await api['water-plants'].$post({
        json: {
            date: toLocalDayKey(value.date),
        },
    })

    if (!res.ok) {
        throw new Error('Network response was not ok')
    }
}

async function getAllDates() {
    const response = await api['water-plants'].$get()
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }

    const data = await response.json()
    return data.waterPlants.map(({ id, date, name, userId }) => {
        const parsedDate = new Date(date)

        return {
            id,
            date: parsedDate,
            dayKey: toLocalDayKey(parsedDate),
            name: name ?? '',
            userId,
        } satisfies WaterBooking
    })
}

// The server checks that the entry is the caller's own; this only sends the id.
async function handleRemove(id: number) {
    const res = await api['water-plants'][':id{[0-9]+}'].$delete({ param: { id: String(id) } })

    if (!res.ok) {
        throw new Error('Network response was not ok')
    }
}

function useWaterForm(
    onEnroll: (value: { date: Date }) => Promise<void>,
    initialDate: Date | null,
) {
    return useForm({
        defaultValues: {
            date: initialDate,
        } as WaterFormValues,
        validators: {
            onChange: createWaterFormSchema,
        },
        onSubmit: async ({ value }) => {
            if (!value.date) {
                return
            }

            await onEnroll({ date: value.date })
        },
    })
}

function WaterDialog({ open, onOpenChange, pickedDate, form }: WaterDialogProps) {
    // Asked again here: a `?date=` link opens this dialog without going past
    // the button on the page.
    const canEdit = useCanEdit()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="top-[10dvh] bottom-auto max-h-[calc(100dvh-12dvh)] translate-y-0 gap-0 overflow-y-auto p-0 sm:top-[50%] sm:max-w-sm sm:translate-y-[-50%]">
                <DialogHeader className="px-4 pt-5 sm:px-6 sm:pt-6">
                    <DialogTitle>Giessen eintragen</DialogTitle>
                    <DialogDescription>
                        Möchtest du am {formatPickedDate(pickedDate)} giessen?
                    </DialogDescription>
                </DialogHeader>
                {/* Nothing left to fill in -- the name comes from the session, so
                    this is a confirmation rather than a form. */}
                <DialogFooter className="sticky bottom-0 mt-4 border-t bg-background px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                    <DialogClose asChild>
                        <Button variant="outline">Abbrechen</Button>
                    </DialogClose>
                    <form.Subscribe
                        selector={(state) => state.isSubmitting}
                        children={(isSubmitting) => (
                            <Button
                                type="button"
                                disabled={isSubmitting || !canEdit}
                                onClick={async () => {
                                    await form.handleSubmit()
                                }}
                            >
                                {isSubmitting ? '...' : 'Einschreiben'}
                            </Button>
                        )}
                    />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function RemoveDialog({ open, onOpenChange, pickedDate, isPending, onConfirm }: RemoveDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="top-[10dvh] bottom-auto max-h-[calc(100dvh-12dvh)] translate-y-0 gap-0 overflow-y-auto p-0 sm:top-[50%] sm:max-w-sm sm:translate-y-[-50%]">
                <DialogHeader className="px-4 pt-5 sm:px-6 sm:pt-6">
                    <DialogTitle>Eintrag löschen</DialogTitle>
                    <DialogDescription>
                        Möchtest du dich am {formatPickedDate(pickedDate)} wieder austragen?
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="sticky bottom-0 mt-4 border-t bg-background px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                    <DialogClose asChild>
                        <Button variant="outline">Abbrechen</Button>
                    </DialogClose>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={isPending}
                        onClick={onConfirm}
                    >
                        {isPending ? '...' : 'Austragen'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

type RainLegendProps = {
    /** The threshold the server actually applied, used when the URL carries none. */
    thresholdMm: number
    rainParam: number | undefined
    onCommit: (value: number | undefined) => void
}

/**
 * The colour key and the threshold slider.
 *
 * Its own component for one reason: the draft value changes on every pointer
 * move, and if that state lived in Giessen each step would re-render all 35
 * calendar cells. Here a drag re-renders this subtree alone.
 */
function RainLegend({ thresholdMm, rainParam, onCommit }: RainLegendProps) {
    // The draft remembers which URL value it was started from. While dragging,
    // rainParam has not moved yet, so the draft wins and the thumb follows the
    // pointer. The moment the commit lands, rainParam no longer matches and the
    // URL takes over again -- at the same number, so nothing visibly changes.
    // Deriving it this way rather than clearing the draft in an effect keeps the
    // state in one direction.
    const [draft, setDraft] = useState<{ value: number; from: number | undefined } | null>(null)
    const shown = draft && draft.from === rainParam ? draft.value : (rainParam ?? thresholdMm)

    return (
        <div className="mt-3 w-full text-[0.7rem] text-muted-foreground">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-1">
                    <span className="size-3 rounded-sm bg-green-400" />
                    eingeschrieben
                </span>
                <span className="flex items-center gap-1">
                    <span className="size-3 rounded-sm bg-sky-400" />
                    Regen gemessen
                </span>
                <span className="flex items-center gap-1">
                    <span className="size-3 rounded-sm bg-sky-200" />
                    Regen erwartet
                </span>
            </div>
            {/* The readout sits on its own line on purpose. Beside the track its
                width changes with the number, which shifts and squeezes the
                track while you are dragging it. */}
            <div className="mt-2 flex flex-col items-center gap-1">
                <span className="tabular-nums">Regen ab {shown} mm</span>
                <div className="flex w-full items-center gap-3">
                    <Slider
                        className="flex-1"
                        min={0}
                        max={SLIDER_MAX_MM}
                        step={0.5}
                        value={[Math.min(shown, SLIDER_MAX_MM)]}
                        aria-label="Regen-Schwelle in Millimetern"
                        onValueChange={([next]) => setDraft({ value: next ?? 0, from: rainParam })}
                        // On release, not on every step: dragging across the
                        // track would otherwise be one navigation and one
                        // refetch per half-millimetre.
                        onValueCommit={([next]) => onCommit(next ?? 0)}
                    />
                    {/* Always rendered, so enabling it cannot move the track. */}
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={rainParam === undefined}
                        className="h-8 shrink-0 px-2 text-[0.7rem]"
                        onClick={() => {
                            setDraft(null)
                            onCommit(undefined)
                        }}
                    >
                        zurücksetzen
                    </Button>
                </div>
            </div>
            <p className="mt-1 text-center">Quelle: MeteoSchweiz</p>
        </div>
    )
}

function Giessen() {
    const { date: dateParam, rain: rainParam } = Route.useSearch()
    // Arriving with `?date=` (from the dashboard card) preselects that day and opens
    // the dialog straight away.
    const [dialogOpen, setDialogOpen] = useState(Boolean(dateParam))
    // Its own flag rather than a second meaning for dialogOpen: a `?date=` link
    // must never open straight into a delete confirmation.
    const [removeOpen, setRemoveOpen] = useState(false)
    const canEdit = useCanEdit()
    const { user } = useSession()
    const navigate = Route.useNavigate()
    const queryClient = useQueryClient()
    const { error, data } = useQuery({
        queryKey: ['get-all-water-dates'],
        queryFn: getAllDates,
    })

    // Only `data` is taken: the page's error branch below stays bound to the
    // bookings query, so an unreachable MeteoSchweiz costs the rain colours and
    // nothing else.
    //
    // The threshold is deliberately NOT in the key. It used to be, and changing
    // it then produced a key with no cached data -- so `rain` went undefined,
    // the legend unmounted, and everything below it jumped up for as long as
    // the request took. The response covers every threshold, so the filter
    // below is a local one and adjusting it costs nothing.
    const { data: rain } = useQuery({
        queryKey: ['get-rain-days'],
        queryFn: getRainDays,
        staleTime: 15 * 60 * 1000,
    })

    const insertWaterDateMutation = useMutation({
        mutationFn: handleEnroll,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['get-all-water-dates'] })
            await queryClient.invalidateQueries({ queryKey: ['get-water-overview'] })
            form.setFieldValue('date', null)
            closeDialog()
        },
    })

    const form = useWaterForm(async (value) => {
        await insertWaterDateMutation.mutateAsync(value)
    }, dateParam ? dayKeyToDate(dateParam) : null)

    const removeWaterDateMutation = useMutation({
        mutationFn: handleRemove,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['get-all-water-dates'] })
            await queryClient.invalidateQueries({ queryKey: ['get-water-overview'] })
            form.setFieldValue('date', null)
            setRemoveOpen(false)
        },
    })

    // Drop the date once the dialog is gone, so a reload does not reopen it --
    // but keep the rain threshold, which is not the dialog's business.
    function closeDialog() {
        setDialogOpen(false)

        if (dateParam) {
            void navigate({
                search: (prev) => (prev.rain === undefined ? {} : { rain: prev.rain }),
                replace: true,
            })
        }
    }

    function setThreshold(value: number | undefined) {
        void navigate({
            // replace, so nudging the number does not fill the back button.
            search: (prev) => ({
                ...(prev.date === undefined ? {} : { date: prev.date }),
                ...(value === undefined ? {} : { rain: value }),
            }),
            replace: true,
        })
    }

    const bookedDates = data?.map((booking) => booking.date) ?? []
    const bookedNamesByDay = new Map(data?.map((booking) => [booking.dayKey, booking.name]) ?? [])
    // The member's own entries, which are the ones they may take back.
    const ownBookingByDay = new Map(
        user
            ? (data ?? [])
                  .filter((booking) => booking.userId === user.id)
                  .map((booking) => [booking.dayKey, booking])
            : [],
    )
    // An own day stays selectable -- selecting it is how it gets removed.
    const takenByOthers =
        data?.filter((booking) => !ownBookingByDay.has(booking.dayKey)).map((booking) => booking.date) ?? []
    // The threshold in force: the URL overrides the server's default.
    const appliedThreshold = rainParam ?? rain?.thresholdMm
    const rainByDay = new Map(
        rain && appliedThreshold !== undefined
            ? rain.rainDays
                  .filter((day) => day.precipMm >= appliedThreshold)
                  .map((day) => [day.date, day])
            : [],
    )

    if (error) return 'An error has occurred: ' + error.message

    return (
        <div className="p-2">
            <div className="p-2 mx-auto max-w-md flex flex-col items-center">
                <h1 className="text-xl font-bold text-center">Giess-Plan</h1>
                <form.Field
                    name="date"
                    children={(field) => (
                        <Calendar
                            mode="single"
                            defaultMonth={field.state.value ?? new Date()}
                            selected={field.state.value ?? undefined}
                            onSelect={(date) => field.handleChange(date ?? null)}
                            disabled={takenByOthers}
                            // Rain is read from rainByDay inside DayButton rather than
                            // registered as a modifier, so it cannot change which days
                            // are selectable.
                            modifiers={{
                                booked: bookedDates,
                            }}
                            modifiersClassNames={{
                                // The green used to live here as [&>button]:bg-green-400.
                                // modifiersClassNames lands on the <td>, so that beat any
                                // background set on the button itself and the diagonal
                                // never showed. Every fill is decided in DayButton now.
                                booked: '[&>button]:line-through rounded-lg border opacity-100',
                            }}
                            className="rounded-lg border shadow-sm mt-3 justify-center [--cell-size:--spacing(11)] md:[--cell-size:--spacing(12)]"
                            components={{
                                DayButton: ({ children, modifiers, day, className, ...props }) => {
                                    const dayKey = toLocalDayKey(day.date)
                                    const bookedName = bookedNamesByDay.get(dayKey)
                                    const firstName = bookedName ? getFirstName(bookedName) : null
                                    const rainDay = rainByDay.get(dayKey)
                                    const isBooked = Boolean(modifiers.booked)
                                    const isOwn = ownBookingByDay.has(dayKey)

                                    const background = rainDay
                                        ? (isBooked ? RAIN_BOOKED : RAIN_OPEN)[rainDay.source]
                                        : isBooked
                                            ? BOOKED_DRY
                                            : undefined

                                    // A rain day nobody took shows how much fell, in the
                                    // slot a name would use. Name first: a day that is both
                                    // keeps its name, and the diagonal carries the rain.
                                    const label = firstName ?? (rainDay ? formatMm(rainDay.precipMm) : null)

                                    return (
                                        <CalendarDayButton
                                            day={day}
                                            modifiers={modifiers}
                                            className={cn(
                                                background,
                                                (isBooked || rainDay) && 'relative px-1 py-1 text-center',
                                                // Marks the green days a member can pick: their own.
                                                isOwn && 'ring-2 ring-inset ring-emerald-700',
                                                // CalendarDayButton sets [&>span]:text-xs, which outranks
                                                // the label's own size and leaves "Regen?" no room. Target
                                                // the label alone -- the day number keeps its size.
                                                label && '[&>span:last-child]:text-[0.5rem]',
                                                className,
                                            )}
                                            title={
                                                rainDay
                                                    ? `${rainLabel(rainDay.source)} ${rainDay.precipMm} mm`
                                                    : undefined
                                            }
                                            {...props}
                                        >
                                            <span className={label ? 'translate-y-[-0.2rem]' : undefined}>
                                                {children}
                                            </span>
                                            {label && (
                                                <span
                                                    className={cn(
                                                        'pointer-events-none absolute right-1 bottom-1 left-1 truncate text-[0.5rem] leading-none',
                                                        rainDay && !isBooked
                                                            ? 'text-sky-950/80'
                                                            : 'text-emerald-900/80',
                                                    )}
                                                >
                                                    {label}
                                                </span>
                                            )}
                                        </CalendarDayButton>
                                    )
                                },
                            }}
                        />
                    )}
                />
                {rain && (
                    <RainLegend
                        thresholdMm={rain.thresholdMm}
                        rainParam={rainParam}
                        onCommit={setThreshold}
                    />
                )}
                <form.Subscribe
                    selector={(state) => state.values.date}
                    children={(pickedDate) => {
                        const pickedIsBooked = Boolean(
                            pickedDate && bookedNamesByDay.has(toLocalDayKey(pickedDate)),
                        )
                        const ownBooking = pickedDate
                            ? ownBookingByDay.get(toLocalDayKey(pickedDate))
                            : undefined

                        return (
                            <>
                                <p className="mt-3 text-sm text-muted-foreground">
                                    {!pickedDate
                                        ? 'Bitte zuerst ein Datum auswählen'
                                        : ownBooking
                                            ? `Du giesst am ${formatPickedDate(pickedDate)}`
                                            : pickedIsBooked
                                                ? `${formatPickedDate(pickedDate)} ist bereits vergeben`
                                                : `Ausgewählt: ${formatPickedDate(pickedDate)}`}
                                </p>
                                {ownBooking ? (
                                    <Button
                                        className="mt-3"
                                        type="button"
                                        variant="destructive"
                                        onClick={() => setRemoveOpen(true)}
                                    >
                                        Austragen
                                    </Button>
                                ) : (
                                    <Button
                                        className="mt-3"
                                        type="button"
                                        disabled={!pickedDate || pickedIsBooked || !canEdit}
                                        onClick={() => setDialogOpen(true)}
                                    >
                                        Einschreiben
                                    </Button>
                                )}
                                <ReadOnlyNotice className="mt-2 text-center" />
                                {pickedDate && ownBooking && (
                                    <RemoveDialog
                                        open={removeOpen}
                                        onOpenChange={setRemoveOpen}
                                        pickedDate={pickedDate}
                                        isPending={removeWaterDateMutation.isPending}
                                        onConfirm={() => removeWaterDateMutation.mutate(ownBooking.id)}
                                    />
                                )}
                            </>
                        )
                    }}
                />
            </div>
            <form.Subscribe
                selector={(state) => state.values.date}
                children={(pickedDate) =>
                    // The guard matters for a hand-typed or stale `?date=` link; the
                    // calendar itself already disables booked days.
                    pickedDate && !bookedNamesByDay.has(toLocalDayKey(pickedDate)) ? (
                        <WaterDialog
                            open={dialogOpen}
                            onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}
                            pickedDate={pickedDate}
                            form={form}
                        />
                    ) : null
                }
            />
        </div>
    )
}
