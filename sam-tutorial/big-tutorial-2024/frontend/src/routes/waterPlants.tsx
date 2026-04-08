import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from "@/lib/api"
import { useForm } from '@tanstack/react-form'
import { createWaterFormSchema } from '@server/sharedTypes'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const Route = createFileRoute('/waterPlants')({
    component: Giessen,
})

function toLocalDayKey(value: Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
}

async function handleEnroll(value) {
    const res = await api["water-plants"].$post({
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
    const response = await api["water-plants"].$get()
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    const data = await response.json()
    const dates = data.waterPlants.map(({ date }) => new Date(date))
    return dates
}

function Giessen() {
    const navigate = useNavigate()


    const queryClient = useQueryClient()
    const { isPending, error, data } = useQuery({ queryKey: ['get-all-water-dates'], queryFn: getAllDates })
    if (error) return 'An error has occurred: ' + error.message
    const insertWaterDateMutation = useMutation({
        mutationFn: handleEnroll,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['get-all-water-dates'] })
            await queryClient.invalidateQueries({ queryKey: ['get-next-free-date'] })
        },
    })

    const form = useForm({
        defaultValues: {
            name: '',
            date: new Date(),
        },
        validators: {
            onChange: createWaterFormSchema,
        },
        onSubmit: async ({ value }) => {
            // Do something with form data
            insertWaterDateMutation.mutate(value)
        },
    })

    return (
        <>
            <div className="p-2">
                <form className="max-w-xl m-auto flex flex-col"
                    onSubmit={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        form.handleSubmit()
                    }}>
                    <form.Field
                        name="date"
                        children={(field) => {
                            return (
                                <div className="p-2 mx-auto max-w-md flex flex-col items-center">
                                    <h1 className="text-xl font-bold text-center">Giess-Plan</h1>
                                    <Calendar
                                        mode="single"
                                        defaultMonth={field.state.value}
                                        selected={field.state.value}
                                        onSelect={(date) => field.handleChange((date ?? new Date()))}
                                        disabled={data}
                                        modifiers={{
                                            booked: data,
                                        }}
                                        modifiersClassNames={{
                                            booked: "[&>button]:line-through opacity-100 [&>button]:bg-green-300",
                                        }}
                                        className="rounded-lg border shadow-sm mt-3 justify-center"
                                    />
                                    <p></p>
                                </div>
                            )
                        }} />
                    <form.Field
                        name="name"
                        children={(field) => {
                            return (
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
                                    {/* <FieldInfo field={field} /> */}
                                </>
                            )
                        }} />
                    <form.Subscribe
                        selector={(state) => [state.canSubmit, state.isSubmitting]}
                        children={([canSubmit, isSubmitting]) => (
                            <Button type="submit" disabled={!canSubmit} className='mt-3'>
                                {isSubmitting ? '...' : 'Einschreiben'}
                            </Button>
                        )}
                    />
                </form>
            </div>
        </>
    )
}
