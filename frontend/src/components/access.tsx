import type { ReactNode } from 'react'

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
 *
 * It names the address, because the usual reason a gardener ends up here is
 * having signed in with a different one than their account is under.
 */
export function ReadOnlyNotice({ className }: { className?: string }) {
    const { user, email, isPending } = useSession()

    if (isPending || user) {
        return null
    }

    return (
        <p className={cn('px-1 text-xs text-muted-foreground', className)}>
            Nur zum Anschauen. Zum Eintragen braucht{' '}
            <span className="break-words">{email ?? 'diese Adresse'}</span> ein Konto.
        </p>
    )
}
