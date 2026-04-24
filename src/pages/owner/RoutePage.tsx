import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import type { Day, Reservation } from '@/types'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return null
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function fmtTime(s: string | null) {
  if (!s) return null
  const [h, m] = s.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function openMapsUrl(origin: string, destination: string, waypoints: string[]) {
  const parts = [origin, ...waypoints, destination].map((p) => encodeURIComponent(p))
  return 'https://www.google.com/maps/dir/' + parts.join('/')
}

function embedUrl(origin: string, destination: string, waypoints: string[]) {
  if (!MAPS_KEY) return null
  const params = new URLSearchParams({ key: MAPS_KEY, origin, destination, mode: 'driving' })
  if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'))
  return `https://www.google.com/maps/embed/v1/directions?${params.toString()}`
}

function loadWaypoints(dayId: string): string[] {
  try {
    const raw = localStorage.getItem(`ww-waypoints-${dayId}`)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch { return [] }
}

function persistWaypoints(dayId: string, wps: string[]) {
  localStorage.setItem(`ww-waypoints-${dayId}`, JSON.stringify(wps))
}

// ── DayRoute ──────────────────────────────────────────────────────────────────

function DayRoute({
  day,
  origin,
  destination,
}: {
  day: Day
  origin: string | null
  destination: string | null
}) {
  const queryClient = useQueryClient()
  const [waypoints, setWaypoints] = useState<string[]>(() => loadWaypoints(day.id))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(waypoints.join('\n'))
  const [editingTime, setEditingTime] = useState(false)
  const [timeDraft, setTimeDraft] = useState(day.departure_time ?? '')

  const saveTimeMutation = useMutation({
    mutationFn: async (time: string) => {
      const { error } = await supabase
        .from('days')
        .update({ departure_time: time || null })
        .eq('id', day.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['days'] })
      setEditingTime(false)
    },
  })

  const hasRoute = !!(origin && destination)
  const embed = hasRoute ? embedUrl(origin, destination, waypoints) : null
  const mapsLink = hasRoute ? openMapsUrl(origin, destination, waypoints) : null

  function saveWaypoints() {
    const parsed = draft.split('\n').map((s) => s.trim()).filter(Boolean)
    setWaypoints(parsed)
    persistWaypoints(day.id, parsed)
    setEditing(false)
  }

  function startEdit() {
    setDraft(waypoints.join('\n'))
    setEditing(true)
  }

  return (
    <div className="card space-y-3">
      {/* Day header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-deep-teal bg-deep-teal/10 rounded px-1.5 py-0.5 shrink-0">
            Day {day.day_number}
          </span>
          {day.date && <span className="text-xs text-forest/50">{fmtDate(day.date)}</span>}
        </div>
        {mapsLink && (
          <a
            href={mapsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sage underline shrink-0"
          >
            Open in Maps ↗
          </a>
        )}
      </div>

      {/* Start time */}
      <div className="flex items-center gap-2">
        {editingTime ? (
          <>
            <input
              type="time"
              value={timeDraft}
              onChange={(e) => setTimeDraft(e.target.value)}
              className="input text-sm py-1 w-36"
              autoFocus
            />
            <button
              onClick={() => saveTimeMutation.mutate(timeDraft)}
              disabled={saveTimeMutation.isPending}
              className="btn-primary text-xs px-3 py-1"
            >
              {saveTimeMutation.isPending ? '…' : 'Save'}
            </button>
            <button
              onClick={() => { setTimeDraft(day.departure_time ?? ''); setEditingTime(false) }}
              className="btn-secondary text-xs px-3 py-1"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => { setTimeDraft(day.departure_time ?? ''); setEditingTime(true) }}
            className="flex items-center gap-1.5 text-xs text-forest/50 hover:text-forest transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {day.departure_time
              ? <span>Depart <strong className="text-forest">{fmtTime(day.departure_time)}</strong></span>
              : <span>+ Set start time</span>
            }
          </button>
        )}
      </div>

      {/* Route visual */}
      <div className="space-y-0">
        {/* Origin */}
        <div className="flex items-stretch gap-3">
          <div className="flex flex-col items-center shrink-0 w-4">
            <div className="w-3 h-3 rounded-full bg-sage mt-0.5 shrink-0" />
            <div className="w-px bg-forest/15 flex-1 my-1" />
          </div>
          <div className="pb-2 min-w-0">
            <p className="text-xs text-forest/40 uppercase tracking-wide">From</p>
            {origin
              ? <p className="text-sm text-forest leading-snug">{origin}</p>
              : <p className="text-sm text-forest/30 italic">No start address — add to day or wallet</p>
            }
          </div>
        </div>

        {/* Waypoints */}
        {waypoints.map((wp, i) => (
          <div key={i} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center shrink-0 w-4">
              <div className="w-2.5 h-2.5 rounded-full bg-gold/60 mt-0.5 shrink-0" />
              <div className="w-px bg-forest/15 flex-1 my-1" />
            </div>
            <div className="pb-2 min-w-0">
              <p className="text-xs text-forest/40 uppercase tracking-wide">Stop</p>
              <p className="text-sm text-forest leading-snug">{wp}</p>
            </div>
          </div>
        ))}

        {/* Destination */}
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center shrink-0 w-4">
            <div className="w-3 h-3 rounded-full bg-terracotta/70 mt-0.5 shrink-0" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-forest/40 uppercase tracking-wide">To</p>
            {destination
              ? <p className="text-sm text-forest leading-snug">{destination}</p>
              : <p className="text-sm text-forest/30 italic">No end address — add hotel to wallet</p>
            }
          </div>
        </div>
      </div>

      {/* Waypoints editor */}
      {editing ? (
        <div className="space-y-2 pt-2 border-t border-forest/10">
          <p className="text-xs text-forest/50">One waypoint per line (name, city, or full address)</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={'Zion National Park, UT\nGrand Canyon South Rim, AZ'}
            rows={3}
            className="input text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={saveWaypoints} className="btn-primary text-sm flex-1">Save</button>
            <button onClick={() => setEditing(false)} className="btn-secondary text-sm px-3">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={startEdit}
          className="text-xs text-sage hover:text-forest transition-colors"
        >
          {waypoints.length > 0 ? 'Edit waypoints' : '+ Add waypoints'}
        </button>
      )}

      {/* Map embed (only if API key present) */}
      {embed && (
        <div className="rounded-lg overflow-hidden border border-forest/10 -mx-0" style={{ height: 220 }}>
          <iframe
            src={embed}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Map – Day ${day.day_number}`}
          />
        </div>
      )}

      {!hasRoute && !editing && (
        <p className="text-xs text-forest/30 italic border-t border-forest/10 pt-2">
          Upload hotel reservation PDFs to the Wallet to auto-fill start and end addresses.
        </p>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RoutePage() {
  const tripId = useAppStore((s) => s.tripId)

  const { data: days = [], isLoading } = useQuery({
    queryKey: ['days', tripId],
    queryFn: async (): Promise<Day[]> => {
      const { data, error } = await supabase
        .from('days').select('*').eq('trip_id', tripId!).order('day_number')
      if (error) throw error
      return data ?? []
    },
    enabled: !!tripId,
  })

  const { data: hotelRes = [] } = useQuery({
    queryKey: ['hotel-reservations-all', tripId],
    queryFn: async (): Promise<Reservation[]> => {
      const { data, error } = await supabase
        .from('reservations').select('*')
        .eq('trip_id', tripId!).eq('type', 'hotel')
        .not('address', 'is', null)
        .order('date')
      if (error) throw error
      return data ?? []
    },
    enabled: !!tripId,
  })

  // date → hotel address (check-in destination)
  const hotelByDate = useMemo(() => {
    const map: Record<string, string> = {}
    for (const r of hotelRes) {
      if (r.date && r.address) map[r.date] = r.address
    }
    return map
  }, [hotelRes])

  function getOrigin(day: Day, prev: Day | undefined): string | null {
    // Previous night's hotel = this day's starting point
    if (prev?.date && hotelByDate[prev.date]) return hotelByDate[prev.date]
    return day.start_location
  }

  function getDestination(day: Day): string | null {
    // Tonight's hotel = this day's ending point
    if (day.date && hotelByDate[day.date]) return hotelByDate[day.date]
    return day.end_location
  }

  if (!tripId) {
    return (
      <div className="p-4 pt-6">
        <p className="text-forest/50 text-sm">No trip selected.</p>
      </div>
    )
  }

  return (
    <div className="p-4 pt-6 pb-10">
      <div className="mb-5">
        <h1 className="font-display text-2xl text-forest leading-tight">Route</h1>
        <p className="text-sm text-forest/50 mt-0.5">
          Day-by-day driving plan — auto-filled from your hotel wallet entries.
        </p>
        {!MAPS_KEY && (
          <p className="text-xs text-forest/30 mt-1">
            Add <span className="font-mono">VITE_GOOGLE_MAPS_API_KEY</span> to .env to enable embedded map previews.
          </p>
        )}
      </div>

      {isLoading && (
        <p className="text-forest/40 text-sm text-center py-20">Loading…</p>
      )}

      {!isLoading && days.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-forest/50 text-sm">No days added yet.</p>
        </div>
      )}

      {!isLoading && days.length > 0 && (
        <div className="space-y-3">
          {days.map((day, i) => (
            <DayRoute
              key={day.id}
              day={day}
              origin={getOrigin(day, days[i - 1])}
              destination={getDestination(day)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
