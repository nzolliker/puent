import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import type { AnyFieldApi } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Circle, History, Plus, Trash2, Undo2 } from 'lucide-react'

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
import { Skeleton } from '@/components/ui/skeleton'
import {
    createTodo,
    deleteTodo,
    getOpenTodos,
    getTodoHistory,
    setTodoDone,
} from '@/lib/todos'
import { createTodoFormSchema } from '@server/sharedTypes'

export const Route = createFileRoute('/aufgaben')({
    component: Aufgaben,
})

type TodoFormValues = {
    title: string
}

const dateFormat = new Intl.DateTimeFormat('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
})

function formatDate(value: string) {
    return dateFormat.format(new Date(value))
}

/**
 * A tick moves a row between the open list and the history, so both queries
 * go stale on every mutation -- as does the dashboard card, which reads the
 * open list under the same key.
 */
function useInvalidateTodos() {
    const queryClient = useQueryClient()

    return async () => {
        await queryClient.invalidateQueries({ queryKey: ['get-open-todos'] })
        await queryClient.invalidateQueries({ queryKey: ['get-todo-history'] })
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

function NewTodoDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const invalidateTodos = useInvalidateTodos()

    const createTodoMutation = useMutation({
        mutationFn: (value: TodoFormValues) => createTodo(value.title),
        onSuccess: async () => {
            await invalidateTodos()
            form.reset()
            onOpenChange(false)
        },
    })

    const form = useForm({
        defaultValues: {
            title: '',
        } as TodoFormValues,
        validators: {
            onChange: createTodoFormSchema,
        },
        onSubmit: async ({ value }) => {
            await createTodoMutation.mutateAsync(value)
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
                    <DialogTitle>Neue Aufgabe</DialogTitle>
                    <DialogDescription>Was ist im Garten zu tun?</DialogDescription>
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
                                    autoFocus
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
                        // required value as well, as the other dialogs do.
                        selector={(state) =>
                            [
                                state.canSubmit,
                                state.isSubmitting,
                                state.values.title.trim().length > 0,
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

function VerlaufDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const invalidateTodos = useInvalidateTodos()

    // Only fetched once the dialog has been opened -- the history is not on
    // screen otherwise, and it grows for as long as the app is used.
    const { isPending, error, data } = useQuery({
        queryKey: ['get-todo-history'],
        queryFn: getTodoHistory,
        enabled: open,
    })

    const undoMutation = useMutation({
        mutationFn: (id: number) => setTodoDone(id, false),
        onSuccess: invalidateTodos,
    })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="top-[10dvh] bottom-auto max-h-[calc(100dvh-12dvh)] translate-y-0 gap-0 overflow-y-auto p-0 sm:top-[50%] sm:max-w-sm sm:translate-y-[-50%]">
                <DialogHeader className="px-4 pt-5 sm:px-6 sm:pt-6">
                    <DialogTitle>Verlauf</DialogTitle>
                    <DialogDescription>Was schon erledigt wurde.</DialogDescription>
                </DialogHeader>
                <div className="px-4 pt-4 pb-4 sm:px-6">
                    {error ? (
                        <p className="py-4 text-sm text-destructive">
                            Verlauf konnte nicht geladen werden.
                        </p>
                    ) : isPending ? (
                        <div className="flex flex-col gap-3 py-2">
                            {Array(3)
                                .fill(0)
                                .map((_, index) => (
                                    <Skeleton key={index} className="h-5 w-full" />
                                ))}
                        </div>
                    ) : data.todos.length ? (
                        <ul className="divide-y text-sm">
                            {data.todos.map((todo) => (
                                <li key={todo.id} className="flex items-center gap-2 py-2">
                                    <span className="flex-1 truncate text-muted-foreground line-through">
                                        {todo.title}
                                    </span>
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {todo.completedAt ? formatDate(todo.completedAt) : ''}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        type="button"
                                        aria-label={`${todo.title} wieder öffnen`}
                                        disabled={undoMutation.isPending}
                                        onClick={() => undoMutation.mutate(todo.id)}
                                    >
                                        <Undo2 />
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            Noch nichts erledigt.
                        </p>
                    )}
                </div>
                <DialogFooter className="sticky bottom-0 border-t bg-background px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
                    <DialogClose asChild>
                        <Button variant="outline">Schliessen</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function Aufgaben() {
    const [newOpen, setNewOpen] = useState(false)
    const [verlaufOpen, setVerlaufOpen] = useState(false)
    const invalidateTodos = useInvalidateTodos()

    const { isPending, error, data } = useQuery({
        queryKey: ['get-open-todos'],
        queryFn: getOpenTodos,
    })

    const completeMutation = useMutation({
        mutationFn: (id: number) => setTodoDone(id, true),
        onSuccess: invalidateTodos,
    })

    const deleteMutation = useMutation({
        mutationFn: deleteTodo,
        onSuccess: invalidateTodos,
    })

    if (error) return 'An error has occurred: ' + error.message

    const busy = completeMutation.isPending || deleteMutation.isPending

    return (
        <div className="mx-auto max-w-2xl p-2">
            <div className="flex items-center justify-between gap-2 px-1">
                <h1 className="text-xl font-bold">Aufgaben</h1>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setVerlaufOpen(true)}
                    >
                        <History />
                        Verlauf
                    </Button>
                    <Button type="button" size="sm" onClick={() => setNewOpen(true)}>
                        <Plus />
                        Neue Aufgabe
                    </Button>
                </div>
            </div>

            <div className="mt-3 rounded-lg border">
                {isPending ? (
                    <ul className="divide-y">
                        {Array(3)
                            .fill(0)
                            .map((_, index) => (
                                <li key={index} className="flex items-center gap-2 px-3 py-2.5">
                                    <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                                    <Skeleton className="h-4 w-40" />
                                </li>
                            ))}
                    </ul>
                ) : data.todos.length ? (
                    <ul className="divide-y">
                        {data.todos.map((todo) => (
                            <li key={todo.id} className="flex items-center gap-2 px-3 py-2.5">
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    type="button"
                                    className="group shrink-0"
                                    aria-label={`${todo.title} erledigen`}
                                    disabled={busy}
                                    onClick={() => completeMutation.mutate(todo.id)}
                                >
                                    <Circle className="text-muted-foreground group-hover:hidden" />
                                    <Check className="hidden group-hover:block" />
                                </Button>
                                <span className="flex-1 truncate text-sm" title={todo.title}>
                                    {todo.title}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    type="button"
                                    className="shrink-0"
                                    aria-label={`${todo.title} löschen`}
                                    disabled={busy}
                                    onClick={() => deleteMutation.mutate(todo.id)}
                                >
                                    <Trash2 />
                                </Button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                        Noch keine Aufgaben.
                    </p>
                )}
            </div>

            <NewTodoDialog open={newOpen} onOpenChange={setNewOpen} />
            <VerlaufDialog open={verlaufOpen} onOpenChange={setVerlaufOpen} />
        </div>
    )
}
