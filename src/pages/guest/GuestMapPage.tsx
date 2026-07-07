import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ALL_STATES, STATE_MAP, detectStates } from '@/lib/usStates'
import UsaStatesMap from '@/components/map/UsaStatesMap'
import StateFactsCard from '@/components/map/StateFactsCard'

// Guest read-only Map tab: states auto-detected from the trip's shared
// locations. (The owner's manually-added states live in their browser only.)

interface GDay {
  start_location: string | null
  end_location: string | null
}

export default function GuestMapPage() {
  const { shareCode } = useParams<{ shareCode: string }>()
  const [selected, setSelected] = useState<string | null>(null)

  const { data: days = [], isLoading } = useQuery({
    queryKey: ['guest_days', shareCode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('guest_get_days', { p_share_code: shareCode! })
      if (error) throw error
      return (data ?? []) as GDay[]
    },
    enabled: !!shareCode,
  })

  const addresses: string[] = []
  for (const d of days) {
    if (d.start_location) addresses.push(d.start_location)
    if (d.end_location) addresses.push(d.end_location)
  }
  const visited = detectStates(addresses)
  const visitedList = [...visited].sort((a, b) =>
    (STATE_MAP[a] ?? a).localeCompare(STATE_MAP[b] ?? b)
  )

  if (isLoading) {
    return (
      <div className="p-4 pt-6 flex justify-center py-20">
        <p className="text-forest/40 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="p-4 pt-6 pb-10">
      <h1 className="font-display text-2xl text-forest mb-1">States</h1>
      <p className="text-sm text-forest/50 mb-4">
        States this trip passes through, from the shared route. Tap a state for its story.
      </p>

      {/* ── The map ── */}
      <div className="card mb-4">
        <UsaStatesMap visited={visited} selected={selected} onSelect={(abbr) => setSelected(abbr)} />
        <div className="flex items-center justify-center gap-4 mt-2">
          <span className="flex items-center gap-1.5 text-[11px] text-forest/50">
            <span className="w-3 h-3 rounded-sm bg-sage/90 border border-forest/40 inline-block" />
            On this trip
          </span>
          <span className="text-[11px] text-forest/40">
            {visited.size} of 50 colored in
          </span>
        </div>
      </div>

      {/* ── Selected state facts ── */}
      {selected && (
        <StateFactsCard
          abbr={selected}
          visited={visited.has(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      {visitedList.length === 0 ? (
        <div className="card text-center py-14 space-y-2">
          <p className="text-3xl">🗺️</p>
          <p className="text-forest/50 text-sm">No states detected yet.</p>
        </div>
      ) : (
        <>
          <div className="card mb-4">
            <p className="section-label mb-2">
              On this trip&nbsp;
              <span className="text-forest/40 font-normal">
                ({visitedList.length} state{visitedList.length !== 1 ? 's' : ''})
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {visitedList.map((abbr) => (
                <div
                  key={abbr}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                  style={{ background: '#eef5f1' }}
                >
                  <span className="text-xs font-bold font-mono text-forest/80">{abbr}</span>
                  <span className="text-xs text-forest/60">{STATE_MAP[abbr]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <p className="section-label mb-3">All States</p>
            <div className="space-y-0.5">
              {ALL_STATES.map(({ abbr, name }) => {
                const isVisited = visited.has(abbr)
                return (
                  <div
                    key={abbr}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${
                      isVisited ? 'bg-sage/15' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold font-mono text-forest/50 w-6 shrink-0">
                        {abbr}
                      </span>
                      <span className={`text-sm ${isVisited ? 'text-forest font-medium' : 'text-forest/60'}`}>
                        {name}
                      </span>
                    </div>
                    {isVisited && (
                      <div className="w-5 h-5 rounded-full bg-sage border-2 border-sage flex items-center justify-center shrink-0">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
