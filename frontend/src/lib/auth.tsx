import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type SessionUser = {
    id: number
    username: string
    name: string
}

export const sessionQueryKey = ['session'] as const

/** The server answers 200 with a null user for a guest, so this never throws on one. */
async function getSession() {
    const response = await api.auth.me.$get()
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    return response.json()
}

/**
 * Nobody signs in here. Cloudflare Access does that before the app is even
 * reached and tells the server the person's e-mail address; the server looks
 * it up and answers with the account behind it, or with none.
 *
 * `email` is there for the guest: it is the one way to see which address they
 * came in with when it turns out not to be the one on their account.
 */
export function useSession() {
    const { data, isPending } = useQuery({
        queryKey: sessionQueryKey,
        queryFn: getSession,
        // Who somebody is cannot change while the page is open -- only an
        // account being added or removed changes the answer, and main.tsx
        // re-reads this the moment a write is refused.
        staleTime: Infinity,
        retry: false,
    })

    return { user: data?.user ?? null, email: data?.email ?? null, isPending }
}

/**
 * Reading is open to everyone Access lets in; writing is for members. Every
 * write affordance asks this, and the server enforces the same rule
 * independently -- this only decides what is worth showing.
 */
export function useCanEdit() {
    return useSession().user !== null
}

/**
 * The session is Cloudflare's, so ending it is too: this path is answered by
 * Access in front of the app and never reaches the server. Locally there is no
 * Access and nothing to sign out of, so it lands on the router's not-found.
 */
export function signOut() {
    window.location.assign('/cdn-cgi/access/logout')
}
