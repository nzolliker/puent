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
import { api } from '@/lib/api'
import { createWaterFormSchema } from '@server/sharedTypes'

export const Route = createFileRoute('/waterPlants')({
    component: Giessen,
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

function toLocalDayKey(value: Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
}

function formatPickedDate(value: Date) {
    return new Intl.DateTimeFormat('de-CH', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(value)
}

function getFirstName(name: string) {
    return name.trim().split(/\s+/)[0] ?? ''
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

function useWaterForm(onEnroll: (value: { name: string; date: Date }) => Promise<void>) {
    return useForm({
        defaultValues: {
            name: '',
            date: null,
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
    const [dialogOpen, setDialogOpen] = useState(false)
    const queryClient = useQueryClient()
    const { error, data } = useQuery({
        queryKey: ['get-all-water-dates'],
        queryFn: getAllDates,
    })

    const insertWaterDateMutation = useMutation({
        mutationFn: handleEnroll,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['get-all-water-dates'] })
            await queryClient.invalidateQueries({ queryKey: ['get-next-free-date'] })
            form.setFieldValue('date', null)
            setDialogOpen(false)
        },
    })

    const form = useWaterForm(async (value) => {
        await insertWaterDateMutation.mutateAsync(value)
    })

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
                    children={(pickedDate) => (
                        <>
                            <p className="mt-3 text-sm text-muted-foreground">
                                {pickedDate
                                    ? `Ausgewählt: ${formatPickedDate(pickedDate)}`
                                    : 'Bitte zuerst ein Datum auswählen'}
                            </p>
                            <Button
                                className="mt-3"
                                type="button"
                                disabled={!pickedDate}
                                onClick={() => setDialogOpen(true)}
                            >
                                Einschreiben
                            </Button>
                        </>
                    )}
                />
            </div>
            <form.Subscribe
                selector={(state) => state.values.date}
                children={(pickedDate) =>
                    pickedDate ? (
                        <WaterDialog
                            open={dialogOpen}
                            onOpenChange={setDialogOpen}
                            pickedDate={pickedDate}
                            form={form}
                        />
                    ) : null
                }
            />
        </div>
    )
}
