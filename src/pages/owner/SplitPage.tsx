import { Link, Navigate } from 'react-router-dom'
import { useTrip } from '@/hooks/useTrip'
import { useAppStore } from '@/store/useAppStore'
import { usePremium } from '@/hooks/usePremium'
import SplitDashboard from '@/components/split/SplitDashboard'

// Owner Split tab (blueprint §8) — requires split_enabled && isPremium (§12).
// The solo Budget tab is untouched; this is a separate, additive ledger.
export default function SplitPage() {
  const { data: trip, isLoading: tripLoading } = useTrip()
  const user = useAppStore((s) => s.user)
  const { isPremium, loading: premiumLoading } = usePremium()

  if (tripLoading || premiumLoading) {
    return (
      <div className="p-4 pt-6 flex justify-center py-20">
        <p className="text-forest/40 text-sm">Loading…</p>
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="p-4 pt-6">
        <h1 className="font-display text-2xl text-forest mb-4">Split</h1>
        <div className="card text-center py-12 space-y-3">
          <p className="text-forest/50 text-sm">No trip selected.</p>
          <Link to="/trips" className="btn-primary inline-block">Go to My Trips</Link>
        </div>
      </div>
    )
  }

  // Split off (or not unlocked) → back to the solo Budget tab (§9).
  if (!trip.split_enabled || !isPremium) {
    return <Navigate to="/budget" replace />
  }

  return (
    <div className="p-4 pt-6 pb-10">
      <h1 className="font-display text-2xl text-forest mb-4">Split</h1>
      <SplitDashboard
        tripId={trip.id}
        tripName={trip.name}
        currency={trip.split_currency ?? '$'}
        deadline={trip.split_deadline ?? null}
        mode="owner"
        currentUserId={user?.id ?? null}
      />
    </div>
  )
}
