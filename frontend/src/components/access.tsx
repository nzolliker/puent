import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

import { useSession } from '@/lib/auth'
import { cn } from '@/lib/utils'

/**
 * The two things a page needs in order to be readable by anyone and writable
 * by members only. The server enforces the rule on its own; these just decide
 * what is worth putting on screen.
 */

/** Hides a control outright -- used for the delete buttons. */
export function MemberOnly({ children }: { children: ReactNode }) {
    const { user } = useSession()

    if (!user) {
        return null
    }

    return <>{children}</>
}

/**
 * Says why the buttons on this page are greyed out. Renders nothing while the
 * session is still loading, so it does not flash at a member on every reload.
 */
export function ReadOnlyNotice({ className }: { className?: string }) {
    const { user, isPending } = useSession()

    if (isPending || user) {
        return null
    }

    return (
        <p className={cn('px-1 text-xs text-muted-foreground', className)}>
            Nur zum Anschauen.{' '}
            <Link to="/login" className="underline underline-offset-2">
                Anmelden
            </Link>{' '}
            zum Eintragen.
        </p>
    )
}
