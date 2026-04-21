import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  function handleSendAgain() {
    setSent(false)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6">
      <img src="/logo.png" alt="WanderWisely" className="w-28 h-28 mb-4" />
      <h1 className="font-display text-3xl text-forest mb-1">WanderWisely</h1>
      <p className="text-forest/50 text-sm mb-8 tracking-wide">Your personal travel wallet</p>

      {sent ? (
        <div className="card text-center max-w-sm w-full space-y-3">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            className="text-gold mx-auto">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          <p className="text-forest font-display text-lg">Check your email</p>
          <p className="text-forest/60 text-sm">
            We sent a magic link to <strong>{email}</strong>.
            <br />Tap it to sign in — no password needed.
          </p>
          <button onClick={handleSendAgain} className="btn-secondary w-full mt-2">
            Send to a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleLogin} className="card max-w-sm w-full space-y-4">
          <div>
            <label className="block text-sm font-medium text-forest mb-1.5">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="input"
            />
          </div>

          {error && (
            <p className="text-sm text-terracotta bg-terracotta/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Sending…' : 'Send magic link'}
          </button>

          <p className="text-center text-xs text-forest/40">
            A sign-in link will be emailed to you.
          </p>
        </form>
      )}
    </div>
  )
}
