import { createFileRoute } from '@tanstack/react-router'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export const Route = createFileRoute('/create-expense')({
  component: CreateExpense,
})

function CreateExpense() {
  return (
  <div className="p-2">
    <form className="max-w-xl m-auto">
      <Label htmlFor="title">Title</Label>
      <Input id="title" placeholder="Expense Title" className="mb-2 mt-1 w-full" />
      <Label htmlFor="amount">Amount</Label>
      <Input id="amount" type="number" placeholder="Expense Amount" className="mb-2 mt-1 w-full" />
      <Button className='mt-3' type="submit">Create Expense</Button>
    </form>
  </div>
)
}