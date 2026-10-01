import { useEffect } from 'react'
import {
    createRootRoute,
    Link,
    Outlet,
    useNavigate,
    useRouterState,
} from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
// import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import { Button } from '@/components/ui/button'
import { useIsGuest, useLogout, useSession } from '@/lib/auth'
import { getFirstName } from '@/lib/utils'

/**
 * The two screens that have to open without a session: the login itself, and a
 * setup link, which is the one thing a person without an account ever receives.
 */
const PUBLIC_PATHS = ['/login', '/setup']

function SessionControls() {
    const { user, isPending } = useSession()
    const isGuest = useIsGuest()
    const logout = useLogout()

    // Nothing while the session is still in flight, so the bar does not flicker
    // from "Anmelden" to a name on every reload.
    if (isPending) {
        return null
    }

    if (!user) {
        return (
            <div className="flex items-center gap-2">
                {/* Says why the write buttons are greyed out before the person
                    has opened a page that explains it. */}
                {isGuest && <span className="text-sm text-muted-foreground">Gast</span>}
                <Link to="/login" className="text-sm [&.active]:font-bold">
                    Anmelden
                </Link>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">{getFirstName(user.name)}</span>
            {/* Icon only: five nav links plus a name already fill a phone. */}
            <Button
                variant="ghost"
                size="icon-xs"
                type="button"
                aria-label="Abmelden"
                title="Abmelden"
                disabled={logout.isPending}
                onClick={() => logout.mutate()}
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
 * Everyone lands on the login screen, and gets past it either by signing in or
 * by choosing to look around as a guest.
 *
 * A component rather than a `beforeLoad`: the router is created without a
 * context, so a loader has no queryClient to read the session from, while
 * useSession works directly here.
 *
 * The gate is only about what this browser shows. A guest cannot change
 * anything because the server refuses every write without a session, not
 * because of anything decided here.
 */
function RootLayout() {
    const { user, isPending } = useSession()
    const isGuest = useIsGuest()
    const navigate = useNavigate()
    const pathname = useRouterState({ select: (state) => state.location.pathname })

    const isPublic = PUBLIC_PATHS.includes(pathname.replace(/\/$/, '') || '/')
    const isIn = user !== null || isGuest
    const locked = !isPending && !isIn && !isPublic

    useEffect(() => {
        if (locked) {
            // replace: the page they could not see does not belong in the back
            // history, or leaving the login screen walks straight back into it.
            void navigate({ to: '/login', replace: true })
        }
    }, [locked, navigate])

    // Blank rather than a spinner, twice over: while the session is in flight,
    // so a reload does not flash the login screen at a member, and while the
    // redirect above has not landed yet.
    if (isPending || locked) {
        return null
    }

    return (
        <>
            {/* The login and setup screens stand alone. Five nav links that a
                visitor cannot follow are worse than no bar at all. */}
            {isIn && (
                <>
                    <NavBar />
                    <hr />
                </>
            )}
            <Outlet />
            {/* <TanStackRouterDevtools /> */}
        </>
    )
}

export const Route = createRootRoute({ component: RootLayout })
