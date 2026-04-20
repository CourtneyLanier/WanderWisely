import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await supabase.auth.signInWithOtp({ email })
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6">
      <img src="/logo.png" alt="WanderWisely" className="w-24 h-24 mb-4" />
      <h1 className="font-display text-3xl text-forest mb-1">WanderWisely</h1>
      <p className="text-forest/60 text-sm mb-8">Your personal travel wallet</p>

      {sent ? (
        <div className="card text-center max-w-sm w-full">
          <p className="text-forest font-medium mb-1">Check your email ✉️</p>
          <p className="text-forest/60 text-sm">
            We sent a magic link to <strong>{email}</strong>
          </p>
        </div>
      ) : (
        <form onSubmit={handleLogin} className="card max-w-sm w-full space-y-4">
          <label className="block text-sm font-medium text-forest">
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="mt-1 w-full border border-forest/20 rounded-lg px-3 py-2
                         bg-white-warm text-forest placeholder:text-forest/40
                         focus:outline-none focus:ring-2 focus:ring-sage"
            />
          </label>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Sending…' : 'Send magic link'}
          </button>
        </form>
      )}
    </div>
  )
}
