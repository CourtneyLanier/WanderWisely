import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { calcDriveTime } from '@/lib/routing'
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

function loadCustomWaypoints(dayId: string): string[] {
  try {
    const raw = localStorage.getItem(`ww-waypoints-${dayId}`)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch { return [] }
}

function persistCustomWaypoints(dayId: string, wps: string[]) {
  localStorage.setItem(`ww-waypoints-${dayId}`, JSON.stringify(wps))
}

// Remember the origin→destination the stored drive time was last computed from,
// so we only auto-recalculate when the route actually changes (and don't stampede
// the geocoder for every existing day on first load).
function loadCalcKey(dayId: string): string | null {
  try { return localStorage.getItem(`ww-route-calc-${dayId}`) } catch { return null }
}
function saveCalcKey(dayId: string, key: string) {
  try { localStorage.setItem(`ww-route-calc-${dayId}`, key) } catch { /* ignore */ }
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
  activityWaypoints,
}: {
  day: Day
  hotelOrigin: string | null
  hotelDestination: string | null
  activityWaypoints: { name: string; address: string; time: string | null }[]
}) {
  const queryClient = useQueryClient()
  const [customWaypoints, setCustomWaypoints] = useState<string[]>(() => loadCustomWaypoints(day.id))
  const [editingWaypoints, setEditingWaypoints] = useState(false)
  const [waypointDraft, setWaypointDraft] = useState(customWaypoints.join('\n'))
  const [editingTime, setEditingTime] = useState(false)
  const [timeDraft, setTimeDraft] = useState(day.departure_time ?? '')
  const [calcState, setCalcState] = useState<'idle' | 'calculating' | 'error'>('idle')
  const [calcError, setCalcError] = useState('')

  // Reset calc state if day data changes
  useEffect(() => {
    setCalcState('idle')
  }, [day.drive_hours, day.drive_miles])

  // Effective values: manual entry wins over wallet fallback
  const origin = day.start_location || hotelOrigin
  const destination = day.end_location || hotelDestination

  // Signature of the current route; when it changes we refresh the drive time.
  const routeKey = origin && destination ? `${origin}=>${destination}` : null

  // All waypoints: activity reservations (sorted by time) + custom user-added
  const allWaypoints = useMemo(() => {
    const actAddr = activityWaypoints.map((w) => w.address)
    return [...actAddr, ...customWaypoints]
  }, [activityWaypoints, customWaypoints])

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

  async function calculateDrive() {
    if (!origin || !destination) return
    setCalcState('calculating')
    setCalcError('')
    try {
      const result = await calcDriveTime(origin, destination)
      if (!result) throw new Error('Could not calculate route — check that both addresses are recognizable.')
      const { error } = await supabase
        .from('days')
        .update({ drive_hours: result.hours, drive_miles: result.miles })
        .eq('id', day.id)
      if (error) throw error
      // Record the route these hours were computed from so we don't recalc again
      // until something actually changes.
      saveCalcKey(day.id, `${origin}=>${destination}`)
      queryClient.invalidateQueries({ queryKey: ['days'] })
      setCalcState('idle')
    } catch (e) {
      setCalcError((e as Error).message)
      setCalcState('error')
    }
  }

  // Auto-recalculate drive time when the route changes (e.g. you edit a location
  // or a wallet hotel updates). First time we see a day, we just record its route
  // without recalculating — that keeps existing trips from refetching every day at
  // once, and only refreshes once the route genuinely changes.
  useEffect(() => {
    if (!routeKey) return
    const stored = loadCalcKey(day.id)
    if (stored === null) {
      saveCalcKey(day.id, routeKey)
      return
    }
    if (stored !== routeKey && calcState !== 'calculating') {
      calculateDrive()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  function saveCustomWaypoints() {
    const parsed = waypointDraft.split('\n').map((s) => s.trim()).filter(Boolean)
    setCustomWaypoints(parsed)
    persistCustomWaypoints(day.id, parsed)
    setEditingWaypoints(false)
  }

  const hasRoute = !!(origin && destination)
  const embed = hasRoute ? embedUrl(origin, destination, allWaypoints) : null
  const mapsLink = hasRoute ? openMapsUrl(origin, destination, allWaypoints) : null
  const hasDriveTime = day.drive_hours != null || day.drive_miles != null

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

      {/* Drive time summary */}
      {hasDriveTime && (
        <div className="flex items-center gap-3 bg-deep-teal/[0.06] rounded-lg px-3 py-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-deep-teal shrink-0">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span className="text-sm text-forest font-medium">
            {day.drive_hours != null ? `${day.drive_hours} hrs` : ''}
            {day.drive_hours != null && day.drive_miles != null ? ' · ' : ''}
            {day.drive_miles != null ? `${day.drive_miles} mi` : ''}
          </span>
          <button
            onClick={calculateDrive}
            disabled={!hasRoute || calcState === 'calculating'}
            className="text-xs text-forest/40 hover:text-sage transition-colors ml-auto"
            title="Recalculate"
          >
            ↻
          </button>
        </div>
      )}

      {/* Calculate prompt */}
      {!hasDriveTime && hasRoute && (
        <div>
          {calcState === 'idle' && (
            <button
              onClick={calculateDrive}
              className="w-full flex items-center justify-center gap-2 text-sm text-deep-teal bg-deep-teal/[0.06] hover:bg-deep-teal/10 rounded-lg py-2 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Calculate drive time
            </button>
          )}
          {calcState === 'calculating' && (
            <p className="text-xs text-forest/40 text-center animate-pulse py-1">Calculating route…</p>
          )}
          {calcState === 'error' && (
            <div className="bg-terracotta/10 rounded-lg px-3 py-2">
              <p className="text-xs text-terracotta">{calcError}</p>
              <button onClick={() => setCalcState('idle')} className="text-xs text-forest/50 underline mt-1">Try again</button>
            </div>
          )}
        </div>
      )}

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

        {/* Activity reservation waypoints (auto, from DB) */}
        {activityWaypoints.map((wp, i) => (
          <div key={`act-${i}`} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center shrink-0 w-4">
              <div className="w-2.5 h-2.5 rounded-full bg-deep-teal/50 mt-0.5 shrink-0" />
              <div className="w-px bg-forest/15 flex-1 my-1" />
            </div>
            <div className="pb-2 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <p className="text-xs text-forest/40 uppercase tracking-wide">Activity</p>
                <span className="text-[10px] text-deep-teal/60 bg-deep-teal/8 rounded px-1 py-px">wallet</span>
                {wp.time && (
                  <span className="text-[10px] text-forest/40">{fmtTime(wp.time)}</span>
                )}
              </div>
              <p className="text-sm font-medium text-forest/80 leading-snug truncate">{wp.name}</p>
              <p className="text-xs text-forest/50 leading-snug truncate">{wp.address}</p>
            </div>
          </div>
        ))}

        {/* Custom user waypoints */}
        {customWaypoints.map((wp, i) => (
          <div key={`custom-${i}`} className="flex items-stretch gap-3">
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

      {/* Custom waypoints editor */}
      {editingWaypoints ? (
        <div className="space-y-2 pt-2 border-t border-forest/10">
          <p className="text-xs text-forest/50">One stop per line (name, city, or full address)</p>
          <textarea
            value={waypointDraft}
            onChange={(e) => setWaypointDraft(e.target.value)}
            placeholder={'Zion National Park, UT\nGrand Canyon South Rim, AZ'}
            rows={3}
            className="input text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={saveCustomWaypoints} className="btn-primary text-sm flex-1">Save</button>
            <button onClick={() => setEditingWaypoints(false)} className="btn-secondary text-sm px-3">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setWaypointDraft(customWaypoints.join('\n')); setEditingWaypoints(true) }}
          className="text-xs text-sage hover:text-forest transition-colors"
        >
          {customWaypoints.length > 0 ? 'Edit custom stops' : '+ Add custom stops'}
        </button>
      )}

      {/* Map embed (requires Google Maps API key in .env) */}
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

      {/* No-key hint */}
      {!embed && hasRoute && !MAPS_KEY && (
        <p className="text-xs text-forest/30">
          Add <span className="font-mono">VITE_GOOGLE_MAPS_API_KEY</span> to .env to see embedded map previews.
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

  // Activity-type reservations with addresses, for auto-waypoints
  const { data: activityRes = [] } = useQuery({
    queryKey: ['activity-reservations-route', tripId],
    queryFn: async (): Promise<Reservation[]> => {
      const { data, error } = await supabase
        .from('reservations').select('*')
        .eq('trip_id', tripId!)
        .in('type', ['activity', 'restaurant'])
        .not('address', 'is', null)
        .order('date').order('time', { nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!tripId,
  })

  // Hotel address lookup by date
  const hotelByDate = useMemo(() => {
    const map: Record<string, string> = {}
    for (const r of hotelRes) {
      if (r.date && r.address) map[r.date] = r.address
    }
    return map
  }, [hotelRes])

  // Activity waypoints grouped by date
  const activityByDate = useMemo(() => {
    const map: Record<string, { name: string; address: string; time: string | null }[]> = {}
    for (const r of activityRes) {
      if (!r.date || !r.address) continue
      if (!map[r.date]) map[r.date] = []
      map[r.date].push({
        name: r.title || r.provider || r.type || 'Activity',
        address: r.address,
        time: r.time,
      })
    }
    return map
  }, [activityRes])

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
          Hotel addresses and booked activities fill in automatically from your Wallet. Tap any field to override.
        </p>
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
              activityWaypoints={day.date ? (activityByDate[day.date] ?? []) : []}
            />
          ))}
        </div>
      )}
    </div>
  )
}
