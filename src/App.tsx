import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import RequireAuth from '@/components/auth/RequireAuth'
import OwnerLayout from '@/components/layout/OwnerLayout'
import LoginPage from '@/pages/auth/LoginPage'
import AuthCallbackPage from '@/pages/auth/AuthCallbackPage'
import TripsPage from '@/pages/owner/TripsPage'
import OverviewPage from '@/pages/owner/OverviewPage'
import DaysPage from '@/pages/owner/DaysPage'
import DayDetailPage from '@/pages/owner/DayDetailPage'
import WalletPage from '@/pages/owner/WalletPage'
import RoutePage from '@/pages/owner/RoutePage'
import BudgetPage from '@/pages/owner/BudgetPage'
import SettingsPage from '@/pages/owner/SettingsPage'
import MapPage from '@/pages/owner/MapPage'
import NotesPage from '@/pages/owner/NotesPage'
import GuestLayout from '@/pages/guest/GuestLayout'
import GuestHomePage from '@/pages/guest/GuestHomePage'
import GuestDaysPage from '@/pages/guest/GuestDaysPage'
import GuestRoutePage from '@/pages/guest/GuestRoutePage'
import NotFoundPage from '@/pages/NotFoundPage'
import { useAppStore } from '@/store/useAppStore'
import { supabase } from '@/lib/supabase'

// Redirects to today's day detail if trip is active, else falls back to /days
function TodayRedirect() {
  const tripId = useAppStore((s) => s.tripId)
  const navigate = useNavigate()

  useEffect(() => {
    if (!tripId) { navigate('/trips', { replace: true }); return }
    const today = new Date().toISOString().split('T')[0]
    supabase
      .from('days').select('id').eq('trip_id', tripId).eq('date', today).maybeSingle()
      .then(({ data }) => {
        if (data?.id) navigate(`/days/${data.id}`, { replace: true })
        else navigate('/days', { replace: true })
      })
  }, [tripId])

  return (
    <div className="p-4 flex justify-center py-20">
      <p className="text-forest/40 text-sm">Loading…</p>
    </div>
  )
}

// If Supabase emails a link to the site root (redirect URL not in allowlist),
// the token arrives in the hash or as ?code=. Forward it to the callback route
// so it isn't stripped by a plain <Navigate> replacement.
function RootRedirect() {
  const tripId = useAppStore((s) => s.tripId)
  const hash = window.location.hash      // implicit flow: #access_token=…
  const search = window.location.search  // PKCE flow:     ?code=…

  const hasToken =
    hash.includes('access_token') ||
    hash.includes('type=magiclink') ||
    hash.includes('type=recovery') ||
    search.includes('code=')

  if (hasToken) {
    const suffix = hash || search
    return <Navigate to={`/auth/callback${suffix}`} replace />
  }

  return <Navigate to={tripId ? '/today' : '/trips'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        {/* Guest view — no auth */}
        <Route path="/trip/:shareCode" element={<GuestLayout />}>
          <Route index element={<GuestHomePage />} />
          <Route path="days" element={<GuestDaysPage />} />
          <Route path="route" element={<GuestRoutePage />} />
        </Route>

        {/* Owner app — auth required */}
        <Route element={<RequireAuth />}>
          <Route element={<OwnerLayout />}>
            <Route path="/trips" element={<TripsPage />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/today" element={<TodayRedirect />} />
            <Route path="/days" element={<DaysPage />} />
            <Route path="/days/:dayId" element={<DayDetailPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/route" element={<RoutePage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/notes" element={<NotesPage />} />
          </Route>
        </Route>

        {/* Redirects */}
        {/* Preserve hash/code so Supabase can process the magic link token */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
