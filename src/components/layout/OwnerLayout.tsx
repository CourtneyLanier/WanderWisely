import { Outlet, useNavigate } from 'react-router-dom'
import TabNav from './TabNav'
import { useAppStore } from '@/store/useAppStore'
import InstallPrompt from '@/components/pwa/InstallPrompt'
import OfflineBanner from '@/components/pwa/OfflineBanner'

export default function OwnerLayout() {
  const signOut = useAppStore((s) => s.signOut)
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-cream pb-20">
      <OfflineBanner />
      <div className="flex items-center justify-between px-4 pt-safe pt-3 pb-2.5 border-b border-forest/[0.07]">
        <img src="/logo-words.png" alt="WanderWisely" className="h-7 object-contain" />
        <button
          onClick={handleSignOut}
          className="text-[11px] text-forest/40 hover:text-forest/70 transition-colors font-medium tracking-wide"
        >
          Sign out
        </button>
      </div>
      <Outlet />
      <TabNav />
      <InstallPrompt />
    </div>
  )
}
