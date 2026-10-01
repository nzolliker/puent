import { useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type SessionUser = {
    id: number
    username: string
    name: string
}

export const sessionQueryKey = ['session'] as const

/** The server answers 200 with a null user for a visitor, so this never throws. */
async function getSession() {
    const response = await api.auth.me.$get()
    if (!response.ok) {
        throw new Error('Network response was not ok')
    }
    const data = await response.json()
    return data.user
}

/** The error the server sent, rather than a generic one -- the login form shows it. */
async function errorMessage(response: Response, fallback: string) {
    try {
        const body = (await response.json()) as { error?: string }
        return body.error ?? fallback
    } catch {
        return fallback
    }
}

export function useSession() {
    const { data, isPending } = useQuery({
        queryKey: sessionQueryKey,
        queryFn: getSession,
        // Who is logged in only changes through the two mutations below, and
        // both invalidate this key themselves.
        staleTime: Infinity,
        retry: false,
    })

    return { user: data ?? null, isPending }
}

/**
 * Reading is open to anyone who can reach the app; writing is not. Every write
 * affordance asks this, and the server enforces the same rule independently --
 * this only decides what is worth showing.
 */
export function useCanEdit() {
    return useSession().user !== null
}

/**
 * Guest mode.
 *
 * The app opens on the login screen, and "Als Gast ansehen" is the way past it
 * without an account. It is a convenience in this browser and not a wall: the
 * read endpoints are public either way, which is exactly why every write is
 * checked on the server independently of anything here.
 *
 * It outlives a reload on purpose -- the alternative is a phone that asks again
 * every morning -- and is cleared the moment somebody logs in or out, so a
 * member who signs out lands back on the login screen rather than in guest mode.
 */
const GUEST_KEY = 'puent.guest'

/** Safari in private browsing throws on localStorage rather than returning null. */
function readGuest() {
    try {
        return localStorage.getItem(GUEST_KEY) === '1'
    } catch {
        return false
    }
}

const guestListeners = new Set<() => void>()

function subscribeGuest(listener: () => void) {
    guestListeners.add(listener)
    return () => guestListeners.delete(listener)
}

function writeGuest(on: boolean) {
    try {
        if (on) {
            localStorage.setItem(GUEST_KEY, '1')
        } else {
            localStorage.removeItem(GUEST_KEY)
        }
    } catch {
        // A browser that refuses to store this still gets a working app for as
        // long as the tab lives: the subscribers below are notified regardless.
    }
    guestListeners.forEach((listener) => listener())
}

export function enterGuestMode() {
    writeGuest(true)
}

export function leaveGuestMode() {
    writeGuest(false)
}

/**
 * Subscribed rather than read during render: the gate in __root.tsx has to
 * re-render the moment the login screen's button writes the flag, and reading
 * localStorage straight from a render body would not tell React anything had
 * changed.
 */
export function useIsGuest() {
    return useSyncExternalStore(subscribeGuest, readGuest, () => false)
}

export function useLogin() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (value: { username: string; password: string }) => {
            const response = await api.auth.login.$post({ json: value })
            if (!response.ok) {
                throw new Error(
                    await errorMessage(response, 'Anmeldung fehlgeschlagen.'),
                )
            }
            const data = await response.json()
            return data.user
        },
        onSuccess: async () => {
            // A member is not a guest. Clearing it here is what makes the flag
            // safe to keep across reloads.
            leaveGuestMode()
            await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
        },
    })
}

export function useLogout() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async () => {
            const response = await api.auth.logout.$post()
            if (!response.ok) {
                throw new Error('Abmelden fehlgeschlagen.')
            }
        },
        onSuccess: async () => {
            // Signing out should land on the login screen, not back in the
            // guest mode this browser may have been in before.
            leaveGuestMode()
            await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
        },
    })
}

export function useSetPassword() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (value: { token: string; password: string }) => {
            const response = await api.auth.setup.$post({ json: value })
            if (!response.ok) {
                throw new Error(
                    await errorMessage(response, 'Passwort konnte nicht gesetzt werden.'),
                )
            }
            const data = await response.json()
            return data.user
        },
        onSuccess: async () => {
            // Setting a password signs you straight in, so the same applies.
            leaveGuestMode()
            await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
        },
    })
}
