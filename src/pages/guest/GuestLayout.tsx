import { NavLink, Outlet, useParams } from 'react-router-dom'

export default function GuestLayout() {
  const { shareCode } = useParams()

  return (
    <div className="min-h-screen bg-cream pb-20">
      <div className="bg-deep-teal text-white/80 text-xs text-center py-2 px-4">
        Trip shared by Courtney · WanderWisely
      </div>
      <Outlet />
      <nav className="tab-nav">
        <NavLink
          to={`/trip/${shareCode}`}
          end
          className={({ isActive }) => `tab-nav-item${isActive ? ' active' : ''}`}
        >
          <span className="text-xl">📅</span>
          <span>Days</span>
        </NavLink>
        <NavLink
          to={`/trip/${shareCode}/wallet`}
          className={({ isActive }) => `tab-nav-item${isActive ? ' active' : ''}`}
        >
          <span className="text-xl">🎫</span>
          <span>Wallet</span>
        </NavLink>
      </nav>
    </div>
  )
}
