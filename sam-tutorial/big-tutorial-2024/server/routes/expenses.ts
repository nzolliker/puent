import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

import { db } from '../db'
import { expenses } from '../db/schema/expenses'

type Expense = {
    id: number,
    title: string,
    amount: number,
}

const expenseSchema = z.object({
    id: z.number().positive(),
    title: z.string(),
    amount: z.number().positive(),
});

const createPostSchema = expenseSchema.omit({ id: true });

type ExpensePost = z.infer<typeof createPostSchema>;

const fakeExpenses: Expense[] = [
    { id: 1, title: 'Coffee', amount: 3.5 },
    { id: 2, title: 'Books', amount: 12.99 },
    { id: 3, title: 'Groceries', amount: 45.0 },
]

export const expensesRoutes = new Hono()

.get('/', (c) => {
  return c.json({ expenses: fakeExpenses })
})

.get('/total-spent',(c) => {
    const total = fakeExpenses.reduce((acc, expense) => acc + expense.amount, 0);
    return c.json({ total });
})

.post('/', zValidator('json', createPostSchema), async (c) => {
    const expense = await c.req.valid('json')
    fakeExpenses.push({...expense, id: fakeExpenses.length + 1})
    c.status(201)
    return c.json(expense)
})

.get('/:id{[0-9]+}', async (c) => {
  const id = Number.parseInt(c.req.param('id'))
  const expense = fakeExpenses.find(e => e.id === id)
  if (!expense) {
    return c.notFound()
  }
    return c.json({ expense })
})

.delete('/:id{[0-9]+}', async (c) => {
    const id = Number.parseInt(c.req.param('id'))
    const index = fakeExpenses.findIndex(e => e.id === id)
    if (index === -1) {
        return c.notFound()
    }
    const deleted = fakeExpenses.splice(index, 1)
    return c.json({ deleted })
});