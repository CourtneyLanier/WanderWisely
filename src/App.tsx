import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import GuestLayout from '@/pages/guest/GuestLayout'
import GuestDaysPage from '@/pages/guest/GuestDaysPage'
import GuestWalletPage from '@/pages/guest/GuestWalletPage'
import NotFoundPage from '@/pages/NotFoundPage'
import { useAppStore } from '@/store/useAppStore'

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

  return <Navigate to={tripId ? '/overview' : '/trips'} replace />
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
          <Route index element={<GuestDaysPage />} />
          <Route path="wallet" element={<GuestWalletPage />} />
        </Route>

        {/* Owner app — auth required */}
        <Route element={<RequireAuth />}>
          <Route element={<OwnerLayout />}>
            <Route path="/trips" element={<TripsPage />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/days" element={<DaysPage />} />
            <Route path="/days/:dayId" element={<DayDetailPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/route" element={<RoutePage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/settings" element={<SettingsPage />} />
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
