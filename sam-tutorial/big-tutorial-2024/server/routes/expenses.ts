import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

import { db } from '../db'
import { expenses as expensesTable } from '../db/schema/expenses'

const expenseSchema = z.object({
    id: z.number().positive(),
    title: z.string(),
    amount: z.string(),
});

type Expense = z.infer<typeof expenseSchema>;

const createPostSchema = expenseSchema.omit({ id: true });

const fakeExpenses: Expense[] = [
    { id: 1, title: 'Coffee', amount: "3.5" },
    { id: 2, title: 'Books', amount: "12.99" },
    { id: 3, title: 'Groceries', amount: "45.0" },
]

export const expensesRoutes = new Hono()

.get('/', async (c) => {

  const expenses = await db.select().from(expensesTable);

  return c.json({ expenses: expenses })
})

.get('/total-spent',(c) => {
    const total = fakeExpenses.reduce((acc, expense) => acc + +expense.amount, 0);
    return c.json({ total });
})

.post('/', zValidator('json', createPostSchema), async (c) => {
    const expense = await c.req.valid('json')

    await db.insert(expensesTable).values({ ...expense });

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