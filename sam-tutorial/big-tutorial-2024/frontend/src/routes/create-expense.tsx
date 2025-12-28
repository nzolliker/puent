import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useForm } from '@tanstack/react-form'
import type { AnyFieldApi } from '@tanstack/react-form'
import { api } from '@/lib/api'

export const Route = createFileRoute('/create-expense')({
  component: CreateExpense,
})

function CreateExpense() {
  const navigate = useNavigate()
  const form = useForm({
    defaultValues: {
      title: '',
      amount: '',
    },
    onSubmit: async ({ value }) => {
      // Do something with form data
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate network delay
      const payload = {
      ...value,
      amount: value.amount === '' ? 0 : Number(value.amount),
    }

      const res = await api.expenses.$post({ json: payload })
      if (!res.ok) {
        throw new Error('Network response was not ok')
      }
      navigate({to: "/expenses"})
    },
  })

function FieldInfo({ field }: { field: AnyFieldApi }) {
  return (
    <>
      {field.state.meta.isTouched && !field.state.meta.isValid ? (
        <em>{field.state.meta.errors.join(', ')}</em>
      ) : null}
      {field.state.meta.isValidating ? 'Validating...' : null}
    </>
  )
}

  return (
  <div className="p-2">
    <form className="max-w-xl m-auto"
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
                <Label htmlFor={field.name}>Title</Label>
                <Input 
                    id={field.name}
                    name={field.name}
                    placeholder="title"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <FieldInfo field={field} />
               </>)}} />
          <form.Field
            name="amount"
            children={(field) => {
              return (
               <>
                <Label htmlFor={field.name} className='mt-3'>Amount</Label>
                <Input 
                    id={field.name}
                    name={field.name}
                    placeholder='0.00'
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    type="number"
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <FieldInfo field={field} />
              </>)}} />
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