import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'

// ── State data ─────────────────────────────────────────────────────────────────

const ALL_STATES: { abbr: string; name: string }[] = [
  { abbr: 'AL', name: 'Alabama' },       { abbr: 'AK', name: 'Alaska' },
  { abbr: 'AZ', name: 'Arizona' },       { abbr: 'AR', name: 'Arkansas' },
  { abbr: 'CA', name: 'California' },    { abbr: 'CO', name: 'Colorado' },
  { abbr: 'CT', name: 'Connecticut' },   { abbr: 'DE', name: 'Delaware' },
  { abbr: 'FL', name: 'Florida' },       { abbr: 'GA', name: 'Georgia' },
  { abbr: 'HI', name: 'Hawaii' },        { abbr: 'ID', name: 'Idaho' },
  { abbr: 'IL', name: 'Illinois' },      { abbr: 'IN', name: 'Indiana' },
  { abbr: 'IA', name: 'Iowa' },          { abbr: 'KS', name: 'Kansas' },
  { abbr: 'KY', name: 'Kentucky' },      { abbr: 'LA', name: 'Louisiana' },
  { abbr: 'ME', name: 'Maine' },         { abbr: 'MD', name: 'Maryland' },
  { abbr: 'MA', name: 'Massachusetts' }, { abbr: 'MI', name: 'Michigan' },
  { abbr: 'MN', name: 'Minnesota' },     { abbr: 'MS', name: 'Mississippi' },
  { abbr: 'MO', name: 'Missouri' },      { abbr: 'MT', name: 'Montana' },
  { abbr: 'NE', name: 'Nebraska' },      { abbr: 'NV', name: 'Nevada' },
  { abbr: 'NH', name: 'New Hampshire' }, { abbr: 'NJ', name: 'New Jersey' },
  { abbr: 'NM', name: 'New Mexico' },    { abbr: 'NY', name: 'New York' },
  { abbr: 'NC', name: 'North Carolina' },{ abbr: 'ND', name: 'North Dakota' },
  { abbr: 'OH', name: 'Ohio' },          { abbr: 'OK', name: 'Oklahoma' },
  { abbr: 'OR', name: 'Oregon' },        { abbr: 'PA', name: 'Pennsylvania' },
  { abbr: 'RI', name: 'Rhode Island' },  { abbr: 'SC', name: 'South Carolina' },
  { abbr: 'SD', name: 'South Dakota' },  { abbr: 'TN', name: 'Tennessee' },
  { abbr: 'TX', name: 'Texas' },         { abbr: 'UT', name: 'Utah' },
  { abbr: 'VT', name: 'Vermont' },       { abbr: 'VA', name: 'Virginia' },
  { abbr: 'WA', name: 'Washington' },    { abbr: 'WV', name: 'West Virginia' },
  { abbr: 'WI', name: 'Wisconsin' },     { abbr: 'WY', name: 'Wyoming' },
]

const STATE_MAP = Object.fromEntries(ALL_STATES.map((s) => [s.abbr, s.name]))

// ── State detection from free-text addresses ───────────────────────────────────

function detectStates(addresses: string[]): Set<string> {
  const found = new Set<string>()
  if (!addresses.length) return found

  const combined = addresses.filter(Boolean).join('\n')
  const lower = combined.toLowerCase()

  for (const { abbr, name } of ALL_STATES) {
    // Full state name match
    if (lower.includes(name.toLowerCase())) { found.add(abbr); continue }
    // Abbreviation in address context: ", TX " / ", TX," / ", TX\n" / ", TX 7…"
    if (new RegExp(`, ${abbr}([\\s,\\d\\n]|$)`, 'gm').test(combined)) found.add(abbr)
  }

  return found
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MapPage() {
  const tripId = useAppStore((s) => s.tripId)
  const storageKey = `ww-visited-states-${tripId ?? 'none'}`

  const [manual, setManual] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch {
      return new Set()
    }
  })

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['map-addresses', tripId],
    queryFn: async (): Promise<string[]> => {
      if (!tripId) return []
      const [daysRes, reservationsRes] = await Promise.all([
        supabase.from('days').select('id, start_location, end_location').eq('trip_id', tripId),
        supabase.from('reservations').select('address').eq('trip_id', tripId),
      ])
      const dayIds = (daysRes.data ?? []).map((d) => d.id)
      const lodgingRes = dayIds.length
        ? await supabase.from('lodging').select('address').in('day_id', dayIds)
        : { data: [] }

      const addrs: string[] = []
      for (const d of daysRes.data ?? []) {
        if (d.start_location) addrs.push(d.start_location)
        if (d.end_location) addrs.push(d.end_location)
      }
      for (const l of lodgingRes.data ?? []) {
        if (l.address) addrs.push(l.address)
      }
      for (const r of reservationsRes.data ?? []) {
        if (r.address) addrs.push(r.address)
      }
      return addrs
    },
    enabled: !!tripId,
  })

  const autoDetected = detectStates(addresses)

  function toggle(abbr: string) {
    // Auto-detected states can't be manually removed (they come from real data)
    if (autoDetected.has(abbr)) return
    setManual((prev) => {
      const next = new Set(prev)
      next.has(abbr) ? next.delete(abbr) : next.add(abbr)
      localStorage.setItem(storageKey, JSON.stringify([...next]))
      return next
    })
  }

  const visited = new Set([...autoDetected, ...manual])
  const visitedList = [...visited].sort((a, b) =>
    (STATE_MAP[a] ?? a).localeCompare(STATE_MAP[b] ?? b)
  )

  return (
    <div className="p-4 pt-6 pb-10">
      <h1 className="font-display text-2xl text-forest mb-1">States</h1>
      <p className="text-sm text-forest/50 mb-4">
        States fill in automatically from your saved addresses. Tap any state to add it manually.
      </p>

      {/* ── Summary banner ── */}
      {visited.size > 0 && (
        <div className="card mb-4">
          <p className="section-label mb-2">
            On this trip&nbsp;
            <span className="text-forest/40 font-normal">({visitedList.length} state{visitedList.length !== 1 ? 's' : ''})</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {visitedList.map((abbr) => (
              <div
                key={abbr}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{ background: autoDetected.has(abbr) ? '#eef5f1' : '#f0ece4' }}
              >
                <span className="text-xs font-bold font-mono text-forest/80">{abbr}</span>
                <span className="text-xs text-forest/60">{STATE_MAP[abbr]}</span>
                {!autoDetected.has(abbr) && (
                  <button
                    onClick={() => toggle(abbr)}
                    className="text-forest/30 hover:text-terracotta text-sm leading-none ml-0.5"
                    aria-label={`Remove ${STATE_MAP[abbr]}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Full state list ── */}
      <div className="card">
        <p className="section-label mb-3">All States</p>
        {isLoading ? (
          <p className="text-sm text-forest/40 py-4 text-center">Loading trip data…</p>
        ) : (
          <div className="space-y-0.5">
            {ALL_STATES.map(({ abbr, name }) => {
              const isAuto = autoDetected.has(abbr)
              const isManual = manual.has(abbr)
              const isVisited = isAuto || isManual

              return (
                <button
                  key={abbr}
                  onClick={() => toggle(abbr)}
                  disabled={isAuto}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors ${
                    isVisited
                      ? 'bg-sage/15 hover:bg-sage/20'
                      : 'hover:bg-cream'
                  } ${isAuto ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold font-mono text-forest/50 w-6 shrink-0">
                      {abbr}
                    </span>
                    <span className={`text-sm ${isVisited ? 'text-forest font-medium' : 'text-forest/60'}`}>
                      {name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isAuto && (
                      <span className="text-xs text-sage font-medium">from trip</span>
                    )}
                    {isManual && !isAuto && (
                      <span className="text-xs text-forest/40">added</span>
                    )}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isVisited
                        ? 'bg-sage border-sage'
                        : 'border-forest/20'
                    }`}>
                      {isVisited && (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
