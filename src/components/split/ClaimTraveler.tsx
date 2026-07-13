import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Traveler } from '@/types'

// One-time "Which one are you?" picker (blueprint §10). Shown to a newly
// enrolled member whose roster spot didn't auto-claim by email. Claiming
// links travelers.user_id to their account via the claim_traveler function
// (server-validated: unclaimed spot, member of the trip, one claim per user).
export default function ClaimTraveler({
  tripId,
  travelers,
  onDone,
}: {
  tripId: string
  travelers: Traveler[]
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [claiming, setClaiming] = useState<string | null>(null)
  const [error, setError] = useState('')

  const unclaimed = travelers.filter((t) => t.user_id === null)

  async function claim(travelerId: string) {
    setClaiming(travelerId)
    setError('')
    try {
      const { data, error } = await supabase.rpc('claim_traveler', { p_traveler_id: travelerId })
      if (error) throw error
      if (!data) throw new Error("Couldn't claim that spot — it may have just been taken. Pick another.")
      queryClient.invalidateQueries({ queryKey: ['travelers', tripId] })
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setClaiming(null)
    }
  }

  return (
    <div className="card">
      <p className="font-display text-lg text-forest mb-1">Which one are you?</p>
      <p className="text-sm text-forest/60 mb-3">
        Claim your spot on the roster so your expenses are logged as you.
      </p>
      {unclaimed.length === 0 ? (
        <p className="text-sm text-forest/50">
          Every roster spot is already claimed — ask the trip planner to add you.
        </p>
      ) : (
        <div className="space-y-2">
          {unclaimed.map((t) => (
            <button
              key={t.id}
              onClick={() => claim(t.id)}
              disabled={claiming !== null}
              className="w-full card-inset px-3 py-2.5 text-left flex items-center justify-between hover:bg-sage/10 transition-colors"
            >
              <span className="text-sm font-medium text-forest">{t.name}</span>
              <span className="text-xs text-sage">{claiming === t.id ? 'Claiming…' : "That's me →"}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-terracotta mt-2">{error}</p>}
      <button onClick={onDone} className="text-xs text-forest/40 underline w-full text-center mt-3">
        Skip for now — just looking
      </button>
    </div>
  )
}
