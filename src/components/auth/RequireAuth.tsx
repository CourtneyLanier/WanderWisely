import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'

export default function RequireAuth() {
  const { user, setUser } = useAppStore()
  const [checking, setChecking] = useState(!user)

  useEffect(() => {
    if (user) return
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setChecking(false)
    })
  }, [user, setUser])

  if (checking) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-forest/50 text-sm">Loading…</p>
      </div>
    )
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />
}
