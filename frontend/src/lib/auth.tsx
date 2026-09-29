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
            await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
        },
    })
}
