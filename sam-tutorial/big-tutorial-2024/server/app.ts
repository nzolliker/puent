import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { expensesRoutes } from './routes/expenses'
import { waterPlantsRoutes } from './routes/waterPlants'
import { serveStatic } from 'hono/bun'

const app = new Hono()

app.use(logger())

const api = app.basePath("/api")
const expensesApi = api.route("/expenses", expensesRoutes)
const waterPlantsApi = api.route("/water-plants", waterPlantsRoutes)
//

//const apiRoutes = app.basePath("/api").route("/expenses", expensesRoutes)

app.get('*', serveStatic({ root: './frontend/dist' }))
app.get('*', serveStatic({ path: './frontend/dist/index.html' }))

export default app
export type ApiRoutes = 
  | typeof expensesApi
  | typeof waterPlantsApi