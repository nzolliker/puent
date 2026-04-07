import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useForm } from '@tanstack/react-form'
import type { AnyFieldApi } from '@tanstack/react-form'
import { api } from '@/lib/api'
import { createExpenseFormSchema } from '@server/sharedTypes'
import { Calendar } from '@/components/ui/calendar'
import { date } from 'drizzle-orm/mysql-core'

export const Route = createFileRoute('/create-expense')({
    component: CreateExpense,
})

function FieldInfo({ field }: { field: AnyFieldApi }) {
    return (
        <p className="error">
            {
                typeof field.state.meta.errors[0] === 'object' && (
                    <div className={`error ${field.state.meta.errors[0].severity}`}>
                        {field.state.meta.errors[0].message}
                    </div>
                )
            }
        </p>
    )
}

function CreateExpense() {
    const navigate = useNavigate()
    const form = useForm({
        defaultValues: {
            title: '',
            amount: '',
            date: new Date(),
        },
        validators: {
            onChange: createExpenseFormSchema,
        },
        onSubmit: async ({ value }) => {
            // Do something with form data
            console.log(value)
            const res = await api.expenses.$post({ json: value })
            if (!res.ok) {
                throw new Error('Network response was not ok')
            }
            navigate({ to: "/expenses" })
        },
    })

    return (
        <div className="p-2">
            <form className="max-w-xl m-auto flex flex-col"
                onSubmit={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    form.handleSubmit()
                }}>
                <form.Field
                    name="title"
                    children={(field) => {
                        return (
                            <>
                                <Label htmlFor={field.name}>Titel</Label>
                                <Input
                                    id={field.name}
                                    name={field.name}
                                    placeholder="Was?"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                />
                                {/* <FieldInfo field={field} /> */}
                            </>
                        )
                    }} />
                <form.Field
                    name="amount"
                    children={(field) => {
                        return (
                            <>
                                <Label htmlFor={field.name} className='mt-3'>Betrag</Label>
                                <Input
                                    id={field.name}
                                    name={field.name}
                                    placeholder='0.00'
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    type="number"
                                    onChange={(e) => field.handleChange(e.target.value)}
                                />
                                {/* <FieldInfo field={field} /> */}
                            </>
                        )
                    }} />
                <form.Field
                    name="date"
                    children={(field) => {
                        return (
                            <div className='self-center pt-4'>
                                <Label className='mb-2' htmlFor={field.name}>Datum</Label>
                                <Calendar
                                    mode="single"
                                    selected={field.state.value}
                                    onSelect={(date) => field.handleChange((date ?? new Date()))}
                                    className="rounded-lg border"
                                />
                            </div>
                        )
                    }} />
                <form.Subscribe
                    selector={(state) => [state.canSubmit, state.isSubmitting]}
                    children={([canSubmit, isSubmitting]) => (
                        <Button type="submit" disabled={!canSubmit} className='mt-3'>
                            {isSubmitting ? '...' : 'Submit'}
                        </Button>
                    )}
                />
            </form>
        </div>
    )
}
