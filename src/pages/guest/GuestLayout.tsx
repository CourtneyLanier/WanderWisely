import { NavLink, Outlet, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import OfflineBanner from '@/components/pwa/OfflineBanner'

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

  const tripName = (tripArr as { name?: string }[])[0]?.name

  return (
    <div className="min-h-screen bg-cream pb-20">
      <OfflineBanner />
      <div className="bg-deep-teal text-white/80 text-xs text-center py-2 px-4">
        {tripName ? `${tripName} · Shared by Courtney` : 'Trip shared by Courtney'} · WanderWisely
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
