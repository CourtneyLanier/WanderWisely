import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') navigate('/overview')
    })
  }, [navigate])

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <p className="text-forest/60 text-sm">Signing you in…</p>
    </div>
  )
}
