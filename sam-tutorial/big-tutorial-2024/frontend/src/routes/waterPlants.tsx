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

type WaterDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    form: any
    pickedDate: Date
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
    return data.waterPlants.map(({ date }) => new Date(date))
}

function WaterDialog({ open, onOpenChange, form, pickedDate }: WaterDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Giessen eintragen</DialogTitle>
                    <DialogDescription>
                        Möchtest du am {formatPickedDate(pickedDate)} giessen?
                    </DialogDescription>
                </DialogHeader>
                <FieldGroup>
                    <form.Field
                        name="name"
                        children={(field: any) => (
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
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <form.Subscribe
                        selector={(state: any) => [state.canSubmit, state.isSubmitting] as const}
                        children={([canSubmit, isSubmitting]: readonly [boolean, boolean]) => (
                            <Button
                                type="button"
                                disabled={!canSubmit}
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

    const form = useForm({
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

            await insertWaterDateMutation.mutateAsync({
                name: value.name,
                date: value.date,
            })
        },
    })

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
                            disabled={data}
                            modifiers={{
                                booked: data,
                            }}
                            modifiersClassNames={{
                                booked: '[&>button]:line-through rounded-lg border opacity-80 [&>button]:bg-green-300',
                            }}
                            className="rounded-lg border shadow-sm mt-3 justify-center [--cell-size:--spacing(11)] md:[--cell-size:--spacing(12)]"
                            components={{
                                DayButton: ({ children, modifiers, day, ...props }) => {
                                    const isWeekend =
                                        day.date.getDay() === 0 || day.date.getDay() === 6
                                    return (
                                        <CalendarDayButton day={day} modifiers={modifiers} {...props}>
                                            {children}
                                            {modifiers.booked && (
                                                <span>Name</span>
                                            )}
                                        </CalendarDayButton>
                                    )
                                },
                            }}
                        />
                    )}
                />
                <form.Subscribe
                    selector={(state: any) => state.values.date as Date | null}
                    children={(pickedDate: Date | null) => (
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
                selector={(state: any) => state.values.date as Date | null}
                children={(pickedDate: Date | null) =>
                    pickedDate ? (
                        <WaterDialog
                            open={dialogOpen}
                            onOpenChange={setDialogOpen}
                            form={form}
                            pickedDate={pickedDate}
                        />
                    ) : null
                }
            />
        </div>
    )
}
