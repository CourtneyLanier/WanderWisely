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

// ── LocationField ─────────────────────────────────────────────────────────────

function LocationField({
  label,
  value,
  hotelValue,
  dotColor,
  showLine,
  onSave,
}: {
  label: string
  value: string | null
  hotelValue: string | null
  dotColor: string
  showLine: boolean
  onSave: (v: string | null) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const fromWallet = !value && !!hotelValue
  const display = value || hotelValue

  function startEdit() {
    setDraft(value ?? hotelValue ?? '')
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    try {
      await onSave(draft.trim() || null)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setEditing(false)
    setDraft('')
  }

  return (
    <div className="flex items-stretch gap-3">
      <div className="flex flex-col items-center shrink-0 w-4">
        <div className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${dotColor}`} />
        {showLine && <div className="w-px bg-forest/15 flex-1 my-1" />}
      </div>
      <div className="pb-2 flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-xs text-forest/40 uppercase tracking-wide">{label}</p>
          {fromWallet && (
            <span className="text-[10px] text-deep-teal/60 bg-deep-teal/8 rounded px-1 py-px">wallet</span>
          )}
        </div>

        {editing ? (
          <div className="space-y-1.5">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="City, address, or landmark"
              className="input text-sm py-1.5"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
            />
            <div className="flex gap-1.5">
              <button
                onClick={save}
                disabled={saving}
                className="btn-primary text-xs px-3 py-1 flex-1"
              >
                {saving ? '…' : 'Save'}
              </button>
              <button onClick={cancel} className="btn-secondary text-xs px-3 py-1">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="w-full text-left group flex items-start gap-1"
          >
            {display ? (
              <>
                <p className={`text-sm leading-snug flex-1 ${fromWallet ? 'text-forest/60' : 'text-forest'}`}>
                  {display}
                </p>
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="shrink-0 mt-0.5 text-forest/20 group-hover:text-forest/50 transition-colors"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </>
            ) : (
              <p className="text-sm text-sage hover:text-forest transition-colors">+ Set {label.toLowerCase()}</p>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ── DayRoute ──────────────────────────────────────────────────────────────────

function DayRoute({
  day,
  hotelOrigin,
  hotelDestination,
}: {
  day: Day
  hotelOrigin: string | null
  hotelDestination: string | null
}) {
  const queryClient = useQueryClient()
  const [waypoints, setWaypoints] = useState<string[]>(() => loadWaypoints(day.id))
  const [editingWaypoints, setEditingWaypoints] = useState(false)
  const [waypointDraft, setWaypointDraft] = useState(waypoints.join('\n'))
  const [editingTime, setEditingTime] = useState(false)
  const [timeDraft, setTimeDraft] = useState(day.departure_time ?? '')

  // Effective values: manual entry wins over wallet fallback
  const origin = day.start_location || hotelOrigin
  const destination = day.end_location || hotelDestination

  const saveTimeMutation = useMutation({
    mutationFn: async (time: string) => {
      const { error } = await supabase
        .from('days').update({ departure_time: time || null }).eq('id', day.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['days'] })
      setEditingTime(false)
    },
  })

  async function saveLocation(field: 'start_location' | 'end_location', value: string | null) {
    const payload = field === 'start_location'
      ? { start_location: value }
      : { end_location: value }
    const { error } = await supabase.from('days').update(payload).eq('id', day.id)
    if (error) throw error
    queryClient.invalidateQueries({ queryKey: ['days'] })
  }

  function saveWaypoints() {
    const parsed = waypointDraft.split('\n').map((s) => s.trim()).filter(Boolean)
    setWaypoints(parsed)
    persistWaypoints(day.id, parsed)
    setEditingWaypoints(false)
  }

  const hasRoute = !!(origin && destination)
  const embed = hasRoute ? embedUrl(origin, destination, waypoints) : null
  const mapsLink = hasRoute ? openMapsUrl(origin, destination, waypoints) : null

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
          <a href={mapsLink} target="_blank" rel="noopener noreferrer"
            className="text-xs text-sage underline shrink-0">
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

      {/* Route visual — From / Stops / To */}
      <div className="space-y-0">
        <LocationField
          label="From"
          value={day.start_location}
          hotelValue={hotelOrigin}
          dotColor="bg-sage"
          showLine={true}
          onSave={(v) => saveLocation('start_location', v)}
        />

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

        <LocationField
          label="To"
          value={day.end_location}
          hotelValue={hotelDestination}
          dotColor="bg-terracotta/70"
          showLine={false}
          onSave={(v) => saveLocation('end_location', v)}
        />
      </div>

      {/* Waypoints editor */}
      {editingWaypoints ? (
        <div className="space-y-2 pt-2 border-t border-forest/10">
          <p className="text-xs text-forest/50">One waypoint per line (name, city, or full address)</p>
          <textarea
            value={waypointDraft}
            onChange={(e) => setWaypointDraft(e.target.value)}
            placeholder={'Zion National Park, UT\nGrand Canyon South Rim, AZ'}
            rows={3}
            className="input text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={saveWaypoints} className="btn-primary text-sm flex-1">Save</button>
            <button onClick={() => setEditingWaypoints(false)} className="btn-secondary text-sm px-3">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setWaypointDraft(waypoints.join('\n')); setEditingWaypoints(true) }}
          className="text-xs text-sage hover:text-forest transition-colors"
        >
          {waypoints.length > 0 ? 'Edit waypoints' : '+ Add waypoints'}
        </button>
      )}

      {/* Map embed */}
      {embed && (
        <div className="rounded-lg overflow-hidden border border-forest/10" style={{ height: 220 }}>
          <iframe
            src={embed}
            width="100%" height="100%"
            style={{ border: 0 }}
            allowFullScreen loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Map – Day ${day.day_number}`}
          />
        </div>
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

  const hotelByDate = useMemo(() => {
    const map: Record<string, string> = {}
    for (const r of hotelRes) {
      if (r.date && r.address) map[r.date] = r.address
    }
    return map
  }, [hotelRes])

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
          Tap any field to edit. Hotel addresses from your Wallet fill in automatically.
        </p>
        {!MAPS_KEY && (
          <p className="text-xs text-forest/30 mt-1">
            Add <span className="font-mono">VITE_GOOGLE_MAPS_API_KEY</span> to .env for embedded map previews.
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
              hotelOrigin={days[i - 1]?.date ? (hotelByDate[days[i - 1].date!] ?? null) : null}
              hotelDestination={day.date ? (hotelByDate[day.date] ?? null) : null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
