import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
// import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

function NavBar() {
  return (
    <div className='p-2 flex justify-between m-auto'>
      <div className="flex gap-4">
        <Link to="/" className="[&.active]:font-bold">
          Home
        </Link>{' '}
        <Link to="/about" className="[&.active]:font-bold">
          About
        </Link>
        <Link to="/waterPlants" className="[&.active]:font-bold">
          Giessen
        </Link>
        <Link to="/expenses" className="[&.active]:font-bold">
          Ausgaben
        </Link>
        <Link to="/create-expense" className="[&.active]:font-bold">
          Eintragen
        </Link>
      </div>
    </div>
    )}

const RootLayout = () => (
  <>
    <NavBar />
    <hr />
    <Outlet />
    {/* <TanStackRouterDevtools /> */}
  </>
)


export const Route = createRootRoute({ component: RootLayout })