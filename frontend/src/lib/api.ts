import { hc } from 'hono/client'
import type { ApiRoutes } from "@server/app"

let unauthorizedHandler: (() => void) | null = null

/**
 * Called once from main.tsx. Reading the app never 401s, so a 401 means a write
 * was attempted by somebody who is not a member -- usually an account that was
 * removed while the tab sat open. Handling it here rather than in every fetcher
 * is the only way it stays handled: the per-route fetchers all throw the same
 * generic error and cannot tell a 401 from a 500.
 */
export function onUnauthorized(handler: () => void) {
    unauthorizedHandler = handler
}

let reloading = false

/**
 * Every request to the server goes through this, the typed client below and
 * the photo upload alike.
 *
 * Cloudflare Access owns the session. When it runs out in an open tab, Access
 * answers the next request with a redirect to its sign-in page on another
 * origin. Followed, that is a CORS failure nobody can tell from being offline;
 * not followed, it is an `opaqueredirect`, which only ever means this. The app
 * itself never redirects. Reloading turns it into a navigation, which Access
 * can answer with its sign-in page and then send the person back here.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
    const response = await fetch(input, { ...init, redirect: 'manual' })

    if (response.type === 'opaqueredirect' && !reloading) {
        reloading = true
        window.location.reload()
    }

    if (response.status === 401) {
        unauthorizedHandler?.()
    }

    return response
}

const client = hc<ApiRoutes>('/', { fetch: apiFetch })

export const api = client.api
