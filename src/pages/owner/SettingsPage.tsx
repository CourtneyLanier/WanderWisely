import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'

export default function SettingsPage() {
  const navigate = useNavigate()
  const setUser = useAppStore((s) => s.setUser)

  async function handleSignOut() {
    await supabase.auth.signOut()
    setUser(null)
    navigate('/login')
  }

  return (
    <div className="p-4 pt-6">
      <h1 className="font-display text-2xl text-forest mb-4">Settings</h1>

      <div className="space-y-4">
        <div className="card">
          <p className="text-xs text-forest/50 uppercase tracking-wide mb-3">Trip Setup</p>
          <div className="space-y-3">
            <label className="block text-sm text-forest">
              Trip name
              <input
                type="text"
                placeholder="e.g. Southwest National Parks 2026"
                className="mt-1 w-full border border-forest/20 rounded-lg px-3 py-2
                           bg-white-warm text-forest placeholder:text-forest/40
                           focus:outline-none focus:ring-2 focus:ring-sage text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-forest">
                Start date
                <input
                  type="date"
                  className="mt-1 w-full border border-forest/20 rounded-lg px-3 py-2
                             bg-white-warm text-forest focus:outline-none focus:ring-2
                             focus:ring-sage text-sm"
                />
              </label>
              <label className="block text-sm text-forest">
                End date
                <input
                  type="date"
                  className="mt-1 w-full border border-forest/20 rounded-lg px-3 py-2
                             bg-white-warm text-forest focus:outline-none focus:ring-2
                             focus:ring-sage text-sm"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="card">
          <p className="text-xs text-forest/50 uppercase tracking-wide mb-3">Budget</p>
          <div className="space-y-3">
            {[
              { label: 'Food total ($)', placeholder: '2500' },
              { label: 'Food days', placeholder: '14' },
              { label: 'Hotel total ($)', placeholder: '3200' },
              { label: 'Hotel buffer ($)', placeholder: '500' },
              { label: 'Car budget ceiling ($)', placeholder: '800' },
            ].map(({ label, placeholder }) => (
              <label key={label} className="block text-sm text-forest">
                {label}
                <input
                  type="number"
                  placeholder={placeholder}
                  className="mt-1 w-full border border-forest/20 rounded-lg px-3 py-2
                             bg-white-warm text-forest placeholder:text-forest/40
                             focus:outline-none focus:ring-2 focus:ring-sage text-sm
                             font-mono"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <p className="text-xs text-forest/50 uppercase tracking-wide mb-3">Guest Sharing</p>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-forest">Share link enabled</span>
            <input type="checkbox" className="w-4 h-4 accent-sage" />
          </div>
          <button className="btn-secondary w-full text-sm">Copy guest link</button>
        </div>

        <button onClick={handleSignOut} className="btn-secondary w-full mt-2">
          Sign out
        </button>
      </div>
    </div>
  )
}
