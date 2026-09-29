import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import type { AnyFieldApi } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'

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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { dayKeyToDate, getFirstName, toLocalDayKey } from '@/lib/utils'
import { createExpenseFormSchema } from '@server/sharedTypes'

export const Route = createFileRoute('/expenses')({
    component: Expenses,
})

type ExpenseFormValues = {
    title: string
    amount: string
    date: Date
    createdBy: string
}

const amountFormat = new Intl.NumberFormat('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

function formatAmount(value: string) {
    return amountFormat.format(Number(value))
}

const dateFormat = new Intl.DateTimeFormat('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
})

function formatDate(value: string) {
    return dateFormat.format(new Date(value))
}

async function getAllExpenses() {
    const response = await api.expenses.$get()
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    const data = await response.json()
    return data
}

async function handleDelete(id: number) {
    const res = await api.expenses[':id{[0-9]+}'].$delete({ param: { id: String(id) } })
    if (!res.ok) {
        throw new Error('Network response was not ok')
    }
}

async function handleCreate(value: ExpenseFormValues) {
    const res = await api.expenses.$post({
        json: {
            ...value,
            // Not the Date itself: it would serialise to a UTC ISO string, so an
            // expense entered in the evening lands on the day before.
            date: toLocalDayKey(value.date),
        },
    })

    if (!res.ok) {
        throw new Error('Network response was not ok')
    }
}

function FieldInfo({ field }: { field: AnyFieldApi }) {
    const error = field.state.meta.errors[0]
    if (!field.state.meta.isTouched || !error) {
        return null
    }

    return (
        <p className="text-sm text-destructive">
            {typeof error === 'object' ? error.message : String(error)}
        </p>
    )
}

function NewExpenseDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const queryClient = useQueryClient()

    const createExpenseMutation = useMutation({
        mutationFn: handleCreate,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['get-all-expenses'] })
            // The dashboard card reads this one; without it the total goes stale.
            await queryClient.invalidateQueries({ queryKey: ['get-total-spent'] })
            form.reset()
            onOpenChange(false)
        },
    })

    const form = useForm({
        defaultValues: {
            title: '',
            amount: '',
            date: new Date(),
            createdBy: '',
        } as ExpenseFormValues,
        validators: {
            onChange: createExpenseFormSchema,
        },
        onSubmit: async ({ value }) => {
            await createExpenseMutation.mutateAsync(value)
        },
    })

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                // Drop a half-filled form on cancel, so reopening starts clean.
                if (!next) form.reset()
                onOpenChange(next)
            }}
        >
            <DialogContent className="top-[10dvh] bottom-auto max-h-[calc(100dvh-12dvh)] translate-y-0 gap-0 overflow-y-auto p-0 sm:top-[50%] sm:max-w-sm sm:translate-y-[-50%]">
                <DialogHeader className="px-4 pt-5 sm:px-6 sm:pt-6">
                    <DialogTitle>Neue Ausgabe</DialogTitle>
                    <DialogDescription>Was wurde für den Garten gekauft?</DialogDescription>
                </DialogHeader>
                <FieldGroup className="gap-4 px-4 pt-4 sm:px-6">
                    <form.Field
                        name="title"
                        children={(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor={field.name}>Titel</Label>
                                <Input
                                    id={field.name}
                                    name={field.name}
                                    placeholder="Was?"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                />
                                <FieldInfo field={field} />
                            </div>
                        )}
                    />
                    <form.Field
                        name="amount"
                        children={(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor={field.name}>Betrag</Label>
                                <Input
                                    id={field.name}
                                    name={field.name}
                                    type="number"
                                    inputMode="decimal"
                                    step="0.05"
                                    placeholder="0.00"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                />
                                <FieldInfo field={field} />
                            </div>
                        )}
                    />
                    <form.Field
                        name="date"
                        children={(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor={field.name}>Datum</Label>
                                <Input
                                    id={field.name}
                                    name={field.name}
                                    type="date"
                                    value={toLocalDayKey(field.state.value)}
                                    onBlur={field.handleBlur}
                                    // Clearing a native date input yields "", which
                                    // would parse to an invalid Date -- keep the
                                    // previous day instead.
                                    onChange={(e) =>
                                        e.target.value &&
                                        field.handleChange(dayKeyToDate(e.target.value))
                                    }
                                />
                            </div>
                        )}
                    />
                    <form.Field
                        name="createdBy"
                        children={(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor={field.name}>Wer</Label>
                                <Input
                                    id={field.name}
                                    name={field.name}
                                    placeholder="Wer?"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                />
                                <FieldInfo field={field} />
                            </div>
                        )}
                    />
                </FieldGroup>
                <DialogFooter className="sticky bottom-0 mt-4 border-t bg-background px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                    <DialogClose asChild>
                        <Button variant="outline">Abbrechen</Button>
                    </DialogClose>
                    <form.Subscribe
                        // `canSubmit` alone is true before the first change, because
                        // the onChange validator has not run yet -- so an untouched
                        // form would offer a button that only 400s. Gate on the
                        // required values as well, as the watering dialog does.
                        selector={(state) =>
                            [
                                state.canSubmit,
                                state.isSubmitting,
                                state.values.title.trim().length > 0 &&
                                    state.values.amount.trim().length > 0 &&
                                    state.values.createdBy.trim().length > 0,
                            ] as const
                        }
                        children={([canSubmit, isSubmitting, isFilled]) => (
                            <Button
                                type="button"
                                disabled={!canSubmit || !isFilled || isSubmitting}
                                onClick={async () => {
                                    await form.handleSubmit()
                                }}
                            >
                                {isSubmitting ? '...' : 'Speichern'}
                            </Button>
                        )}
                    />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function Expenses() {
    const [dialogOpen, setDialogOpen] = useState(false)
    const queryClient = useQueryClient()
    const { isPending, error, data } = useQuery({
        queryKey: ['get-all-expenses'],
        queryFn: getAllExpenses,
    })

    const deleteExpenseMutation = useMutation({
        mutationFn: handleDelete,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['get-all-expenses'] })
            await queryClient.invalidateQueries({ queryKey: ['get-total-spent'] })
        },
    })

    if (error) return 'An error has occurred: ' + error.message

    return (
        <div className="mx-auto max-w-2xl p-2">
            <div className="flex items-center justify-between gap-2 px-1">
                <h1 className="text-xl font-bold">Ausgaben</h1>
                <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
                    <Plus />
                    Neuer Eintrag
                </Button>
            </div>

            <div className="mt-3 rounded-lg border">
                <Table className="text-xs">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Titel</TableHead>
                            <TableHead className="text-right">Betrag</TableHead>
                            <TableHead>Datum</TableHead>
                            <TableHead>Wer</TableHead>
                            <TableHead className="w-8 pl-0">
                                <span className="sr-only">Aktionen</span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isPending ? (
                            Array(3)
                                .fill(0)
                                .map((_, index) => (
                                    <TableRow key={index}>
                                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                        <TableCell><Skeleton className="ml-auto h-4 w-12" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                                        <TableCell className="pl-0"><Skeleton className="h-6 w-6" /></TableCell>
                                    </TableRow>
                                ))
                        ) : data?.expenses?.length ? (
                            data.expenses.map((expense) => (
                                <TableRow key={expense.id}>
                                    <TableCell
                                        className="max-w-[9rem] truncate font-medium"
                                        title={expense.title ?? undefined}
                                    >
                                        {expense.title}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {formatAmount(expense.amount)}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {formatDate(expense.date)}
                                    </TableCell>
                                    <TableCell
                                        className="max-w-[5rem] truncate"
                                        title={expense.createdBy ?? undefined}
                                    >
                                        {expense.createdBy ? getFirstName(expense.createdBy) : '—'}
                                    </TableCell>
                                    <TableCell className="pl-0">
                                        <Button
                                            variant="ghost"
                                            size="icon-xs"
                                            type="button"
                                            aria-label={`${expense.title} löschen`}
                                            disabled={deleteExpenseMutation.isPending}
                                            onClick={() => deleteExpenseMutation.mutate(expense.id)}
                                        >
                                            <Trash2 />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className="py-6 text-center text-muted-foreground"
                                >
                                    Noch keine Ausgaben.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <NewExpenseDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        </div>
    )
}
