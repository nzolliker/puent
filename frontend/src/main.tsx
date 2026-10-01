import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'

import { RouterProvider, createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'
import { onUnauthorized } from './lib/api'
import { sessionQueryKey } from './lib/auth'

// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const queryClient = new QueryClient()

// Reading never 401s, so this only fires on a write without a session -- almost
// always one that expired while the tab sat open. Re-read the session so the
// write buttons drop back to read-only, and offer the login rather than the
// bare "Network response was not ok" the fetchers would otherwise throw.
onUnauthorized(() => {
  queryClient.invalidateQueries({ queryKey: sessionQueryKey })
  router.navigate({ to: '/login' })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
