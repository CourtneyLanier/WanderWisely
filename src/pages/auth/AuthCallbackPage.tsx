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

    // A magic link always carries a token: ?code=… (PKCE) or #access_token=…
    // (implicit). Arriving without one — link copied incompletely, opened
    // directly, or stripped in transit — is a state that will NEVER resolve,
    // so it has to be reported rather than waited on.
    const hash = window.location.hash
    const hasToken =
      !!code ||
      hash.includes('access_token') ||
      hash.includes('type=magiclink') ||
      hash.includes('type=recovery')

    // Backstop for the opposite failure: a token is present but nothing ever
    // settles (network stall, unreachable auth host). Without this the page
    // pulses the logo indefinitely and the user is given nothing to act on.
    const stuck = window.setTimeout(() => {
      setError('Signing in is taking longer than expected. The link may have expired — please request a new one.')
    }, 15_000)

    if (code) {
      // PKCE flow — Supabase project has PKCE enabled (newer default).
      // Exchange the one-time code for a session.
      supabase.auth.exchangeCodeForSession(code).then(({ data, error: err }) => {
        window.clearTimeout(stuck)
        if (err) {
          setError(err.message)
        } else if (data.session) {
          setUser(data.session.user)
          navigate('/overview', { replace: true })
        } else {
          // No error and no session: the code was structurally valid but bought
          // nothing — almost always a link that was already redeemed.
          setError('This link has expired or was already used. Please request a new one.')
        }
      })
      return () => window.clearTimeout(stuck)
    }

    // Implicit flow — token is in the URL hash (#access_token=…).
    // Supabase client processes the hash automatically on init.
    // getSession() catches the case where that finished before this component mounted.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.clearTimeout(stuck)
        setUser(session.user)
        navigate('/overview', { replace: true })
      } else if (!hasToken) {
        window.clearTimeout(stuck)
        setError("This link doesn't have a sign-in token in it. It may have been copied incompletely — request a new one and open it directly from the email.")
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        window.clearTimeout(stuck)
        setUser(session.user)
        navigate('/overview', { replace: true })
      }
      if (event === 'SIGNED_OUT') {
        window.clearTimeout(stuck)
        setError('This link has expired or was already used. Please request a new one.')
      }
    })

    return () => {
      window.clearTimeout(stuck)
      subscription.unsubscribe()
    }
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
