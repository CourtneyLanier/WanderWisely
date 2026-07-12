// "Cool stops along the drive" — Claude suggests quirky roadside attractions,
// local-flavor restaurants, coffee shops, etc. for a day's route, and each
// suggestion can be added to the day's plans as a side quest with one tap.
// Online-only (the suggestions come from a live web search).

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  suggestStops,
  STOP_CATEGORY_ICONS,
  type SuggestedStop,
} from '@/lib/suggestStops'

export default function SuggestStopsSection({
  dayId,
  from,
  to,
  date,
}: {
  dayId: string
  from: string
  to: string
  date: string | null
}) {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stops, setStops] = useState<SuggestedStop[] | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  async function handleDiscover() {
    if (navigator.onLine === false) {
      setError('Finding stops needs an internet connection.')
      return
    }
    setLoading(true)
    setError('')
    try {
      setStops(await suggestStops(from, to, date))
      setAdded(new Set())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const addMutation = useMutation({
    mutationFn: async (stop: SuggestedStop) => {
      const notes = [stop.description, stop.detour ? `Detour: ${stop.detour}` : '']
        .filter(Boolean)
        .join('\n')
      const { error: insErr } = await supabase.from('activities').insert({
        day_id: dayId,
        name: stop.name,
        type: 'side_quest',
        address: stop.address ?? stop.location ?? null,
        url: stop.website,
        notes: notes || null,
        is_booked: false,
      })
      if (insErr) throw insErr
    },
    onSuccess: (_data, stop) => {
      queryClient.invalidateQueries({ queryKey: ['activities', dayId] })
      setAdded((prev) => new Set(prev).add(stop.name))
    },
    onError: (e) => setError((e as Error).message),
  })

  return (
    <div className="mb-4">
      <p className="section-label mb-2">Discover</p>

      {!stops && (
        <div className="card text-center py-5 space-y-2">
          <p className="text-sm text-forest/60">
            Quirky roadside stops, local diners, and great coffee between{' '}
            <span className="font-medium text-forest">{from}</span> and{' '}
            <span className="font-medium text-forest">{to}</span>?
          </p>
          <button onClick={handleDiscover} disabled={loading} className="btn-primary text-sm px-4">
            {loading ? 'Scouting the route…' : '✨ Find cool stops on this drive'}
          </button>
          {loading && (
            <p className="text-[11px] text-forest/40 animate-pulse">
              Searching the web for local gems — takes about a minute.
            </p>
          )}
        </div>
      )}

      {stops && (
        <div className="space-y-3">
          {stops.map((stop) => {
            const isAdded = added.has(stop.name)
            return (
              <div key={stop.name} className="card">
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0 mt-0.5">
                    {STOP_CATEGORY_ICONS[stop.category]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-forest leading-snug">{stop.name}</p>
                    <p className="text-xs text-forest/45 mt-0.5">
                      {stop.location}
                      {stop.detour && <span className="text-deep-teal"> · {stop.detour}</span>}
                    </p>
                    <p className="text-sm text-forest/75 leading-snug mt-1.5">{stop.description}</p>
                    {stop.website && (
                      <a
                        href={stop.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs text-deep-teal underline underline-offset-2 mt-1.5 hover:text-forest transition-colors"
                      >
                        Visit website ↗
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => addMutation.mutate(stop)}
                    disabled={isAdded || addMutation.isPending}
                    className={`text-sm px-3 py-1.5 shrink-0 ${
                      isAdded ? 'text-sage font-medium' : 'btn-secondary'
                    }`}
                  >
                    {isAdded ? '✓ Added' : '+ Add'}
                  </button>
                </div>
              </div>
            )
          })}
          <div className="text-center">
            <button
              onClick={handleDiscover}
              disabled={loading}
              className="text-xs text-sage hover:text-forest transition-colors py-1"
            >
              {loading ? 'Scouting the route…' : '↻ Search again'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-terracotta mt-2">{error}</p>}
    </div>
  )
}
