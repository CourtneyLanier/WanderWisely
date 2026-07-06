import { NavLink, Outlet, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import OfflineBanner from '@/components/pwa/OfflineBanner'
import type { GuestTrip } from '@/types'

export default function GuestLayout() {
  const { shareCode } = useParams<{ shareCode: string }>()

  const { data: tripArr = [] } = useQuery({
    queryKey: ['guest_trip', shareCode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('guest_get_trip', { p_share_code: shareCode! })
      if (error) throw error
      return data ?? []
    },
    enabled: !!shareCode,
  })

  const trip = (tripArr as GuestTrip[])[0]

  // Tabs are driven by the per-trip share flags (Home is always visible).
  // The database functions enforce these server-side; this only controls the nav.
  const tabs = [
    { to: `/trip/${shareCode}`,        end: true,  icon: '🏠', label: 'Home',   show: true },
    { to: `/trip/${shareCode}/days`,   end: false, icon: '📅', label: 'Days',   show: trip?.share_days ?? true },
    { to: `/trip/${shareCode}/route`,  end: false, icon: '🧭', label: 'Route',  show: trip?.share_route ?? true },
    { to: `/trip/${shareCode}/wallet`, end: false, icon: '💳', label: 'Wallet', show: trip?.share_wallet ?? false },
    { to: `/trip/${shareCode}/budget`, end: false, icon: '💰', label: 'Budget', show: trip?.share_budget ?? false },
    { to: `/trip/${shareCode}/notes`,  end: false, icon: '📝', label: 'Notes',  show: trip?.share_notes ?? false },
    { to: `/trip/${shareCode}/map`,    end: false, icon: '🗺️', label: 'Map',    show: trip?.share_map ?? false },
  ].filter((t) => t.show)

  return (
    <div className="min-h-screen bg-cream pb-20">
      <OfflineBanner />
      <div className="bg-deep-teal text-white/80 text-xs text-center py-2 px-4">
        {trip?.name ? `${trip.name} · Shared by Courtney` : 'Trip shared by Courtney'} · WanderWisely
      </div>
      <Outlet />
      <nav className="tab-nav">
        {tabs.map(({ to, end, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `tab-nav-item${isActive ? ' active' : ''}`}
          >
            <span className="text-xl">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
