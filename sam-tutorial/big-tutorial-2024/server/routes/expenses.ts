import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'


import { db } from '../db'
import { expenses as expensesTable, insertExpenseSchema } from '../db/schema/expenses'

import { createExpenseSchema } from '../sharedTypes'
import { desc, sum, eq } from 'drizzle-orm'

export const expensesRoutes = new Hono()

.get('/', async (c) => {

  const expenses = await db
    .select()
    .from(expensesTable)
    .orderBy(desc(expensesTable.createdAt));

  return c.json({ expenses: expenses })
})

.post('/', zValidator('json', createExpenseSchema), async (c) => {
    const expense = await c.req.valid('json')

    const validatedExpense = insertExpenseSchema.parse({
        ...expense});

    const result = await db.insert(expensesTable).values({ ...validatedExpense }).$returningId();

    c.status(201)
    return c.json(result)
})

.get('/total-spent', async (c) => {
    const result = await db
    .select({total: sum(expensesTable.amount)})
    .from(expensesTable)
    .then((res) => res[0]);
    return c.json(result);
})

.get('/:id{[0-9]+}', async (c) => {
  const id = Number.parseInt(c.req.param('id'))

  const expense = await db
    .select()
    .from(expensesTable)
    .where(eq(expensesTable.id, id))
    .then((res) => res[0]);

  if (!expense) {
    return c.notFound()
  }
    return c.json({ expense })
})

.delete('/:id{[0-9]+}', async (c) => {
    const id = Number.parseInt(c.req.param('id'))
    
    const expense = await db
    .delete(expensesTable)
    .where(eq(expensesTable.id, id))

    if (!expense) {
        return c.notFound()
    }
    return c.json({ id: id })
});