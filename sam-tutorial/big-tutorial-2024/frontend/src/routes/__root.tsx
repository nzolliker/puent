import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
// import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

function NavBar() {
  return (
    <div className="p-2 flex gap-2 fixed bottom-0 left-1 right-0 border-t">
      <Link to="/" className="[&.active]:font-bold">
        Home
      </Link>{' '}
      <Link to="/about" className="[&.active]:font-bold">
        About
      </Link>
      <Link to="/expenses" className="[&.active]:font-bold">
        Expenses
      </Link>
      <Link to="/create-expense" className="[&.active]:font-bold">
        Create Expense
      </Link>
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