import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
// import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import { Button } from '@/components/ui/button'
import { useLogout, useSession } from '@/lib/auth'
import { getFirstName } from '@/lib/utils'

function SessionControls() {
    const { user, isPending } = useSession()
    const logout = useLogout()

    // Nothing while the session is still in flight, so the bar does not flicker
    // from "Anmelden" to a name on every reload.
    if (isPending) {
        return null
    }

    if (!user) {
        return (
            <Link to="/login" className="text-sm [&.active]:font-bold">
                Anmelden
            </Link>
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

const RootLayout = () => (
    <>
        <NavBar />
        <hr />
        <Outlet />
        {/* <TanStackRouterDevtools /> */}
    </>
)


export const Route = createRootRoute({ component: RootLayout })
