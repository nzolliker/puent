import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, CalendarDayButton } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { dayKeyToDate, getFirstName, toLocalDayKey } from '@/lib/utils'
import { api } from '@/lib/api'
import { createWaterFormSchema } from '@server/sharedTypes'

const dayKeyPattern = /^\d{4}-\d{2}-\d{2}$/

type WaterSearch = {
    /** Preselects this day and opens the enroll dialog, e.g. from the dashboard card. */
    date?: string
}

export const Route = createFileRoute('/waterPlants')({
    component: Giessen,
    validateSearch: (search: Record<string, unknown>): WaterSearch => {
        const date = search.date

        return typeof date === 'string' && dayKeyPattern.test(date) ? { date } : {}
    },
})

type WaterFormValues = {
    name: string
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
    date: Date
    dayKey: string
    name: string
}

function formatPickedDate(value: Date) {
    return new Intl.DateTimeFormat('de-CH', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(value)
}

async function handleEnroll(value: { name: string; date: Date }) {
    const res = await api['water-plants'].$post({
        json: {
            ...value,
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
    return data.waterPlants.map(({ date, name }) => {
        const parsedDate = new Date(date)

        return {
            date: parsedDate,
            dayKey: toLocalDayKey(parsedDate),
            name: name ?? '',
        } satisfies WaterBooking
    })
}

function useWaterForm(
    onEnroll: (value: { name: string; date: Date }) => Promise<void>,
    initialDate: Date | null,
) {
    return useForm({
        defaultValues: {
            name: '',
            date: initialDate,
        } as WaterFormValues,
        validators: {
            onChange: createWaterFormSchema,
        },
        onSubmit: async ({ value }) => {
            if (!value.date) {
                return
            }

            await onEnroll({ name: value.name, date: value.date })
        },
    })
}

function WaterDialog({ open, onOpenChange, pickedDate, form }: WaterDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="top-[10dvh] bottom-auto max-h-[calc(100dvh-12dvh)] translate-y-0 gap-0 overflow-y-auto p-0 sm:top-[50%] sm:max-w-sm sm:translate-y-[-50%]">
                <DialogHeader className="px-4 pt-5 sm:px-6 sm:pt-6">
                    <DialogTitle>Giessen eintragen</DialogTitle>
                    <DialogDescription>
                        Möchtest du am {formatPickedDate(pickedDate)} giessen?
                    </DialogDescription>
                </DialogHeader>
                <FieldGroup className="px-4 pt-4 sm:px-6">
                    <form.Field
                        name="name"
                        children={(field) => (
                            <>
                                <Label htmlFor={field.name}>Name</Label>
                                <Input
                                    id={field.name}
                                    name={field.name}
                                    placeholder="Wer?"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                />
                            </>
                        )}
                    />
                </FieldGroup>
                <DialogFooter className="sticky bottom-0 border-t bg-background px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                    <DialogClose asChild>
                        <Button variant="outline">Abbrechen</Button>
                    </DialogClose>
                    <form.Subscribe
                        selector={(state) => [state.values.name, state.isSubmitting] as const}
                        children={([name, isSubmitting]) => (
                            <Button
                                type="button"
                                disabled={name.trim().length === 0 || isSubmitting}
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

function Giessen() {
    const { date: dateParam } = Route.useSearch()
    // Arriving with `?date=` (from the dashboard card) preselects that day and opens
    // the dialog straight away.
    const [dialogOpen, setDialogOpen] = useState(Boolean(dateParam))
    const navigate = Route.useNavigate()
    const queryClient = useQueryClient()
    const { error, data } = useQuery({
        queryKey: ['get-all-water-dates'],
        queryFn: getAllDates,
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

    // Drop the param once the dialog is gone, so a reload does not reopen it.
    function closeDialog() {
        setDialogOpen(false)

        if (dateParam) {
            void navigate({ search: {}, replace: true })
        }
    }

    const bookedDates = data?.map((booking) => booking.date) ?? []
    const bookedNamesByDay = new Map(data?.map((booking) => [booking.dayKey, booking.name]) ?? [])

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
                            disabled={bookedDates}
                            modifiers={{
                                booked: bookedDates,
                            }}
                            modifiersClassNames={{
                                booked: '[&>button]:line-through rounded-lg border opacity-100 [&>button]:bg-green-400',
                            }}
                            className="rounded-lg border shadow-sm mt-3 justify-center [--cell-size:--spacing(11)] md:[--cell-size:--spacing(12)]"
                            components={{
                                DayButton: ({ children, modifiers, day, className, ...props }) => {
                                    const bookedName = bookedNamesByDay.get(toLocalDayKey(day.date))
                                    const firstName = bookedName ? getFirstName(bookedName) : null

                                    return (
                                        <CalendarDayButton
                                            day={day}
                                            modifiers={modifiers}
                                            className={
                                                modifiers.booked
                                                    ? `relative px-1 py-1 text-center ${className ?? ''}`
                                                    : className
                                            }
                                            {...props}
                                        >
                                            <span className={firstName ? 'translate-y-[-0.2rem]' : undefined}>
                                                {children}
                                            </span>
                                            {firstName && (
                                                <span className="pointer-events-none absolute right-1 bottom-1 left-1 truncate text-[0.5rem] leading-none text-emerald-900/80">
                                                    {firstName}
                                                </span>
                                            )}
                                        </CalendarDayButton>
                                    )
                                },
                            }}
                        />
                    )}
                />
                <form.Subscribe
                    selector={(state) => state.values.date}
                    children={(pickedDate) => {
                        const pickedIsBooked = Boolean(
                            pickedDate && bookedNamesByDay.has(toLocalDayKey(pickedDate)),
                        )

                        return (
                            <>
                                <p className="mt-3 text-sm text-muted-foreground">
                                    {!pickedDate
                                        ? 'Bitte zuerst ein Datum auswählen'
                                        : pickedIsBooked
                                            ? `${formatPickedDate(pickedDate)} ist bereits vergeben`
                                            : `Ausgewählt: ${formatPickedDate(pickedDate)}`}
                                </p>
                                <Button
                                    className="mt-3"
                                    type="button"
                                    disabled={!pickedDate || pickedIsBooked}
                                    onClick={() => setDialogOpen(true)}
                                >
                                    Einschreiben
                                </Button>
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
