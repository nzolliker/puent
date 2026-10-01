import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { Camera, CircleDollarSign, Droplets, House, ListTodo, LogOut } from 'lucide-react'
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
            {/* Icon only, like the nav links beside it. A guest gets it too --
                signing out is how they come back in with the address their
                account is under. */}
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

const navLinks = [
    { to: '/', label: 'Home', icon: House },
    { to: '/waterPlants', label: 'Giessen', icon: Droplets },
    { to: '/expenses', label: 'Ausgaben', icon: CircleDollarSign },
    { to: '/aufgaben', label: 'Aufgaben', icon: ListTodo },
    { to: '/fotos', label: 'Fotos', icon: Camera },
] as const

function NavBar() {
    return (
        // Icons rather than words: five page names and a name did not fit one
        // 390px row, and the app is used on a phone. Still allowed to wrap, in
        // case a long first name pushes it over.
        <div className='p-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 m-auto'>
            <div className="flex flex-wrap gap-1">
                {navLinks.map(({ to, label, icon: Icon }) => (
                    // The label is what a screen reader and a desktop hover
                    // get; each page repeats it in its own heading.
                    <Link
                        key={to}
                        to={to}
                        aria-label={label}
                        title={label}
                        className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent [&.active]:bg-accent [&.active]:text-foreground"
                    >
                        <Icon className="size-5" />
                    </Link>
                ))}
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
