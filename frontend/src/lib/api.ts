import { hc } from 'hono/client'
import type { ApiRoutes } from "@server/app"

let unauthorizedHandler: (() => void) | null = null

/**
 * Called once from main.tsx. Reading the app never 401s, so a 401 means a write
 * was attempted without a session -- usually one that expired while the tab was
 * open. Handling it here rather than in every fetcher is the only way it stays
 * handled: the per-route fetchers all throw the same generic error and cannot
 * tell a 401 from a 500.
 */
export function onUnauthorized(handler: () => void) {
    unauthorizedHandler = handler
}

const client = hc<ApiRoutes>('/', {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await fetch(input, init)

        // Not the auth routes themselves: a wrong password is also a 401, and
        // that belongs to the login form rather than to this handler.
        const url = typeof input === 'string' ? input : input.toString()
        if (response.status === 401 && !url.includes('/api/auth/')) {
            unauthorizedHandler?.()
        }

        return response
    },
})

export const api = client.api
