import { Outlet, useNavigate } from 'react-router-dom'
import TabNav from './TabNav'
import { useAppStore } from '@/store/useAppStore'

export default function OwnerLayout() {
  const signOut = useAppStore((s) => s.signOut)
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-cream pb-20">
      {/* Minimal top bar — will be replaced/absorbed by page headers in design pass */}
      <div className="flex items-center justify-between px-4 pt-safe pt-3 pb-2">
        <img src="/logo-words.png" alt="WanderWisely" className="h-6 object-contain" />
        <button
          onClick={handleSignOut}
          className="text-xs text-forest/50 hover:text-forest transition-colors"
        >
          Sign out
        </button>
      </div>

      <Outlet />
      <TabNav />
    </div>
  )
}
