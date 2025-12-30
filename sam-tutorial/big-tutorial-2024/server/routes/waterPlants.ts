import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

import { db } from '../db'
import { expenses as expensesTable } from '../db/schema/expenses'

const waterPlantsSchema = z.object({
    id: z.number().positive(),
    name: z.string(),
    date: z.date(),
});

type waterPlants = z.infer<typeof waterPlantsSchema>;

const fakeWaterPlants: waterPlants[] = [
    { id: 1, name: 'Nicola', date: new Date(2025, 11, 29) },
    { id: 2, name: 'Marek', date: new Date(2025, 11, 30) },
]


export const waterPlantsRoutes = new Hono()
.get('/', async (c) => {
    return c.json({ waterPlants: fakeWaterPlants })
})