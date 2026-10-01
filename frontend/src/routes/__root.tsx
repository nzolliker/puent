import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
// import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import { Button } from '@/components/ui/button'
import { signOut, useSession } from '@/lib/auth'
import { getFirstName } from '@/lib/utils'

function SessionControls() {
    const { user, isPending } = useSession()

    // Nothing while the session is still in flight, so the bar does not flicker
    // from "Gast" to a name on every reload.
    if (isPending) {
        return null
    }

    return (
        <div className="flex items-center gap-1">
            {/* "Gast" says why the write buttons are greyed out before the
                person has opened a page that explains it. */}
            <span className="text-sm text-muted-foreground">
                {user ? getFirstName(user.name) : 'Gast'}
            </span>
            {/* Icon only: five nav links plus a name already fill a phone. A
                guest gets it too -- signing out is how they come back in with
                the address their account is under. */}
            <Button
                variant="ghost"
                size="icon-xs"
                type="button"
                aria-label="Abmelden"
                title="Abmelden"
                onClick={signOut}
            >
                <LogOut />
            </Button>
        </div>
    )
}

function NavBar() {
    return (
        // Wraps rather than overflowing: the five links and a name do not fit
        // one 390px row, and the app is used on a phone.
        <div className='p-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 m-auto'>
            <div className="flex flex-wrap gap-4">
                <Link to="/" className="[&.active]:font-bold">
                    Home
                </Link>{' '}
                <Link to="/waterPlants" className="[&.active]:font-bold">
                    Giessen
                </Link>
                <Link to="/expenses" className="[&.active]:font-bold">
                    Ausgaben
                </Link>
                <Link to="/aufgaben" className="[&.active]:font-bold">
                    Aufgaben
                </Link>
                <Link to="/fotos" className="[&.active]:font-bold">
                    Fotos
                </Link>
            </div>
            <SessionControls />
        </div>
    )
}

/**
 * There is no gate here. Whoever sees this page has already been let in by
 * Cloudflare Access, and the server refuses every request that has not; what
 * is left to decide is member or guest, and that is only about which buttons
 * are worth showing.
 */
function RootLayout() {
    return (
        <>
            <NavBar />
            <hr />
            <Outlet />
            {/* <TanStackRouterDevtools /> */}
        </>
    )
}

export const Route = createRootRoute({ component: RootLayout })
