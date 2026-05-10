import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'

// ── State data ─────────────────────────────────────────────────────────────────

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',      AK: 'Alaska',         AZ: 'Arizona',       AR: 'Arkansas',
  CA: 'California',   CO: 'Colorado',       CT: 'Connecticut',   DE: 'Delaware',
  FL: 'Florida',      GA: 'Georgia',        HI: 'Hawaii',        ID: 'Idaho',
  IL: 'Illinois',     IN: 'Indiana',        IA: 'Iowa',          KS: 'Kansas',
  KY: 'Kentucky',     LA: 'Louisiana',      ME: 'Maine',         MD: 'Maryland',
  MA: 'Massachusetts',MI: 'Michigan',       MN: 'Minnesota',     MS: 'Mississippi',
  MO: 'Missouri',     MT: 'Montana',        NE: 'Nebraska',      NV: 'Nevada',
  NH: 'New Hampshire',NJ: 'New Jersey',     NM: 'New Mexico',    NY: 'New York',
  NC: 'North Carolina',ND: 'North Dakota',  OH: 'Ohio',          OK: 'Oklahoma',
  OR: 'Oregon',       PA: 'Pennsylvania',   RI: 'Rhode Island',  SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee',      TX: 'Texas',         UT: 'Utah',
  VT: 'Vermont',      VA: 'Virginia',       WA: 'Washington',    WV: 'West Virginia',
  WI: 'Wisconsin',    WY: 'Wyoming',
}

// Tile grid — [row][col], 11 cols x 9 rows, AlbersUSA-inspired layout
const GRID: (string | null)[][] = [
  [null, null, null, null, null, null, null, null, null, null, 'ME'],
  [null, null, null, null, null, null, null, null, null, 'VT', 'NH'],
  ['WA', null, 'MT', 'ND', 'MN', null, null, 'MI', null, 'MA', null],
  ['OR', 'ID', 'WY', 'SD', 'WI', null, null, null, 'NY', 'RI', null],
  ['CA', 'NV', 'CO', 'NE', 'IA', 'IL', 'IN', 'OH', 'PA', 'CT', 'NJ'],
  [null, 'UT', null, 'KS', 'MO', null, 'KY', 'WV', 'VA', 'MD', 'DE'],
  ['AZ', null, 'NM', 'OK', 'AR', 'TN', null, 'NC', null, null, null],
  [null, null, 'TX', null, 'LA', 'MS', 'AL', 'GA', 'SC', null, null],
  ['HI', 'AK', null, null, null, null, null, 'FL', null, null, null],
]

const COLS = 11
const ROWS = 9
const CELL = 58   // SVG units per cell (including gap)
const TILE = 54   // tile size (CELL - 4px gap)
const VW = COLS * CELL
const VH = ROWS * CELL

// ── State detection ────────────────────────────────────────────────────────────

function detectStates(addresses: string[]): Set<string> {
  const found = new Set<string>()
  if (!addresses.length) return found

  const combined = addresses.filter(Boolean).join('\n')
  const lower = combined.toLowerCase()

  // Full state names (most reliable)
  for (const [abbr, name] of Object.entries(STATE_NAMES)) {
    if (lower.includes(name.toLowerCase())) found.add(abbr)
  }

  // Abbreviations in address context: ", TX " / ", TX," / ", TX\n" / ", TX 7…"
  for (const abbr of Object.keys(STATE_NAMES)) {
    const pattern = new RegExp(`, ${abbr}([\\s,\\d\\n]|$)`, 'gm')
    if (pattern.test(combined)) found.add(abbr)
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
  const visited = new Set([...autoDetected, ...manual])

  function toggle(abbr: string) {
    setManual((prev) => {
      const next = new Set(prev)
      // If auto-detected and not manually toggled off, toggling removes manual flag only
      // If not visited at all, add manually; if manually added, remove it
      if (next.has(abbr)) {
        next.delete(abbr)
      } else {
        next.add(abbr)
      }
      localStorage.setItem(storageKey, JSON.stringify([...next]))
      return next
    })
  }

  const visitedSorted = [...visited].sort((a, b) =>
    (STATE_NAMES[a] ?? a).localeCompare(STATE_NAMES[b] ?? b)
  )

  return (
    <div className="p-4 pt-6 pb-10">
      <h1 className="font-display text-2xl text-forest mb-1">Trip Map</h1>
      <p className="text-sm text-forest/50 mb-4">
        States auto-fill from your saved addresses. Tap any state to add or remove it manually.
      </p>

      {/* ── Tile map ── */}
      <div className="card p-3 mb-4">
        {isLoading ? (
          <p className="text-center text-sm text-forest/40 py-8">Loading trip data…</p>
        ) : (
          <svg
            viewBox={`0 0 ${VW} ${VH}`}
            className="w-full"
            role="img"
            aria-label="US states tile map"
          >
            {GRID.map((row, rowIdx) =>
              row.map((abbr, colIdx) => {
                if (!abbr) return null
                const x = colIdx * CELL + 2
                const y = rowIdx * CELL + 2
                const isVisited = visited.has(abbr)
                const isAuto = autoDetected.has(abbr)
                const isManual = manual.has(abbr) && !isAuto

                return (
                  <g key={abbr} onClick={() => toggle(abbr)} style={{ cursor: 'pointer' }}>
                    <rect
                      x={x} y={y}
                      width={TILE} height={TILE}
                      rx={7}
                      fill={
                        isAuto
                          ? '#3d7a62'
                          : isManual
                          ? '#6aaa8e'
                          : '#ebe5da'
                      }
                      stroke={isVisited ? '#2f6050' : '#d5ccc0'}
                      strokeWidth={isVisited ? 1.5 : 1}
                    />
                    <text
                      x={x + TILE / 2}
                      y={y + TILE / 2 + 1}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={11}
                      fontWeight={isVisited ? '700' : '400'}
                      fontFamily="system-ui, sans-serif"
                      fill={isVisited ? '#ffffff' : '#9c9080'}
                    >
                      {abbr}
                    </text>
                  </g>
                )
              })
            )}
          </svg>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: '#3d7a62' }} />
            <span className="text-xs text-forest/50">From trip addresses</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: '#6aaa8e' }} />
            <span className="text-xs text-forest/50">Added manually</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: '#ebe5da' }} />
            <span className="text-xs text-forest/50">Not visited</span>
          </div>
        </div>
      </div>

      {/* ── States list ── */}
      {visitedSorted.length > 0 ? (
        <div className="card">
          <p className="section-label mb-3">
            States on this trip &nbsp;
            <span className="text-forest/40 font-normal">({visitedSorted.length})</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {visitedSorted.map((abbr) => {
              const isAuto = autoDetected.has(abbr)
              return (
                <div
                  key={abbr}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                  style={{ background: isAuto ? '#eef5f1' : '#f2ede6' }}
                >
                  <span className="text-xs font-bold text-forest/80 font-mono">{abbr}</span>
                  <span className="text-xs text-forest/60">{STATE_NAMES[abbr]}</span>
                  {!isAuto && (
                    <button
                      onClick={() => toggle(abbr)}
                      className="text-forest/30 hover:text-terracotta text-sm leading-none ml-0.5"
                      title="Remove"
                      aria-label={`Remove ${STATE_NAMES[abbr]}`}
                    >
                      x
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="card text-center py-8 space-y-2">
          <p className="text-forest/50 text-sm">No states detected yet.</p>
          <p className="text-forest/35 text-xs">
            States fill in automatically as you add addresses to your days, wallet, and lodging.
            You can also tap any state above to mark it manually.
          </p>
        </div>
      )}
    </div>
  )
}
