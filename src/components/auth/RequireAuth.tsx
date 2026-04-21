import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'

export default function RequireAuth() {
  const { user, setUser } = useAppStore()
  // null = still checking; false = confirmed no session
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // onAuthStateChange fires immediately with INITIAL_SESSION event,
    // giving us the current session without a separate getSession() call.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setChecking(false)
    })

    return () => subscription.unsubscribe()
  }, [setUser])

  if (checking) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <img src="/logo.png" alt="" className="w-16 h-16 animate-pulse opacity-60" />
      </div>
    )
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />
}
