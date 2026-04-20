import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from '@/components/auth/RequireAuth'
import OwnerLayout from '@/components/layout/OwnerLayout'
import LoginPage from '@/pages/auth/LoginPage'
import AuthCallbackPage from '@/pages/auth/AuthCallbackPage'
import OverviewPage from '@/pages/owner/OverviewPage'
import DaysPage from '@/pages/owner/DaysPage'
import DayDetailPage from '@/pages/owner/DayDetailPage'
import WalletPage from '@/pages/owner/WalletPage'
import BudgetPage from '@/pages/owner/BudgetPage'
import SettingsPage from '@/pages/owner/SettingsPage'
import GuestLayout from '@/pages/guest/GuestLayout'
import GuestDaysPage from '@/pages/guest/GuestDaysPage'
import GuestWalletPage from '@/pages/guest/GuestWalletPage'
import NotFoundPage from '@/pages/NotFoundPage'

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
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/days" element={<DaysPage />} />
            <Route path="/days/:dayId" element={<DayDetailPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* Redirects */}
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
