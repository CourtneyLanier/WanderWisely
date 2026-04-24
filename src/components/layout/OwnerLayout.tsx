import { Outlet, useNavigate, Link } from 'react-router-dom'
import TabNav from './TabNav'
import { useAppStore } from '@/store/useAppStore'
import { useTrip } from '@/hooks/useTrip'
import InstallPrompt from '@/components/pwa/InstallPrompt'
import OfflineBanner from '@/components/pwa/OfflineBanner'

export default function OwnerLayout() {
  const signOut = useAppStore((s) => s.signOut)
  const navigate = useNavigate()
  const { data: trip } = useTrip()

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-cream pb-20">
      <OfflineBanner />
      <div className="flex items-center justify-between px-4 pt-safe pt-3 pb-2.5 border-b border-forest/[0.07]">
        <img src="/logo-words.png" alt="WanderWisely" className="h-7 object-contain shrink-0" />
        <div className="flex items-center gap-3 min-w-0">
          {trip && (
            <Link
              to="/trips"
              className="text-xs text-forest/50 hover:text-forest transition-colors font-medium truncate max-w-[140px]"
              title={trip.name}
            >
              {trip.name} ▾
            </Link>
          )}
          <button
            onClick={handleSignOut}
            className="text-[11px] text-forest/40 hover:text-forest/70 transition-colors font-medium tracking-wide shrink-0"
          >
            Sign out
          </button>
        </div>
      </div>
      <Outlet />
      <TabNav />
      <InstallPrompt />
    </div>
  )
}
