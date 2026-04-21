import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const setUser = useAppStore((s) => s.setUser)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')

    if (code) {
      // PKCE flow — Supabase project has PKCE enabled (newer default).
      // Exchange the one-time code for a session.
      supabase.auth.exchangeCodeForSession(code).then(({ data, error: err }) => {
        if (err) {
          setError(err.message)
        } else if (data.session) {
          setUser(data.session.user)
          navigate('/overview', { replace: true })
        }
      })
      return
    }

    // Implicit flow — token is in the URL hash (#access_token=…).
    // Supabase client processes the hash automatically on init.
    // getSession() catches the case where that finished before this component mounted.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        navigate('/overview', { replace: true })
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        setUser(session.user)
        navigate('/overview', { replace: true })
      }
      if (event === 'SIGNED_OUT') {
        setError('This link has expired or was already used. Please request a new one.')
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate, setUser])

  if (error) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6 gap-4">
        <img src="/logo.png" alt="WanderWisely" className="w-20 h-20 opacity-60" />
        <p className="text-terracotta text-sm text-center max-w-xs">{error}</p>
        <a href="/login" className="btn-primary">
          Back to sign in
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-3">
      <img src="/logo.png" alt="WanderWisely" className="w-20 h-20 animate-pulse" />
      <p className="text-forest/50 text-sm">Signing you in…</p>
    </div>
  )
}
