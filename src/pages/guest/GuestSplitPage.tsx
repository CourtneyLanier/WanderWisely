import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useTripMembership } from '@/hooks/useTripMembership'
import SplitDashboard from '@/components/split/SplitDashboard'
import ClaimTraveler from '@/components/split/ClaimTraveler'
import type { GuestTrip, Traveler, Trip } from '@/types'

// The member Split view (blueprint §10) — the auth-aware side of the share
// link. Anonymous visitors get a "log in to join" prompt; a logged-in visitor
// is auto-enrolled as a member, claims their roster spot (auto by email, else
// picker), then acts as themselves with RLS-scoped writes. Free forever for
// members — nothing here checks premium (§12).
export default function GuestSplitPage() {
  const { shareCode } = useParams<{ shareCode: string }>()

  // Cached by GuestLayout — tells us whether split is shared at all.
  const { data: tripArr = [] } = useQuery({
    queryKey: ['guest_trip', shareCode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('guest_get_trip', { p_share_code: shareCode! })
      if (error) throw error
      return data ?? []
    },
    enabled: !!shareCode,
  })
  const guestTrip = (tripArr as GuestTrip[])[0]
  const shareSplit = guestTrip?.share_split ?? false

  const { user, checkingSession, tripId, joining, joinError } =
    useTripMembership(shareCode, shareSplit)

  // Full trip row (currency, deadline, name) — readable once a member, via RLS.
  const { data: memberTrip } = useQuery({
    queryKey: ['member_trip', tripId],
    queryFn: async (): Promise<Trip | null> => {
      const { data, error } = await supabase
        .from('trips').select('*').eq('id', tripId!).maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!tripId,
  })

  const { data: travelers = [] } = useQuery({
    queryKey: ['travelers', tripId],
    queryFn: async (): Promise<Traveler[]> => {
      const { data, error } = await supabase
        .from('travelers').select('*').eq('trip_id', tripId!).order('sort_order')
      if (error) throw error
      return (data ?? []) as Traveler[]
    },
    enabled: !!tripId,
  })

  const [skippedClaim, setSkippedClaim] = useState(false)
  const myTraveler = travelers.find((t) => t.user_id != null && t.user_id === user?.id)

  if (!guestTrip || checkingSession) {
    return (
      <div className="p-4 flex justify-center py-20">
        <p className="text-forest/40 text-sm">Loading…</p>
      </div>
    )
  }

  if (!shareSplit) {
    return (
      <div className="p-4 pt-6">
        <div className="card text-center py-12">
          <p className="text-forest/50 text-sm">Expense splitting isn't shared for this trip.</p>
        </div>
      </div>
    )
  }

  // Anonymous → participation needs a (free) account.
  if (!user) {
    return (
      <div className="p-4 pt-6">
        <h1 className="font-display text-2xl text-forest mb-4">Split</h1>
        <div className="card text-center py-10 space-y-3">
          <p className="text-3xl">💸</p>
          <p className="font-display text-lg text-forest">Join the trip split</p>
          <p className="text-sm text-forest/60 px-4">
            Log in to claim your spot, add expenses, and settle up. Joining is free —
            then come back to this link.
          </p>
          <Link to="/login" className="btn-primary inline-block">Log in to join</Link>
        </div>
      </div>
    )
  }

  if (joining) {
    return (
      <div className="p-4 flex justify-center py-20">
        <p className="text-forest/40 text-sm">Joining the trip…</p>
      </div>
    )
  }

  if (joinError || !tripId) {
    return (
      <div className="p-4 pt-6">
        <div className="card text-center py-12">
          <p className="text-forest/50 text-sm">
            {joinError?.message ?? "Couldn't join this trip's split — the link may have changed."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 pt-6 pb-10">
      <h1 className="font-display text-2xl text-forest mb-4">Split</h1>
      {!myTraveler && !skippedClaim && travelers.length > 0 ? (
        <ClaimTraveler tripId={tripId} travelers={travelers} onDone={() => setSkippedClaim(true)} />
      ) : (
        <SplitDashboard
          tripId={tripId}
          tripName={memberTrip?.name ?? guestTrip.name}
          currency={memberTrip?.split_currency ?? '$'}
          deadline={memberTrip?.split_deadline ?? null}
          mode="member"
          currentUserId={user.id}
        />
      )}
    </div>
  )
}
