import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── types (local — guest functions return plain objects, not full Row types) ───

interface GTrip {
  id: string; name: string; start_date: string | null; end_date: string | null
  num_days: number | null; share_code: string; share_enabled: boolean; created_at: string
}
interface GDay {
  id: string; trip_id: string; day_number: number; date: string | null
  departure_time: string | null; start_location: string | null; end_location: string | null
  drive_miles: number | null; drive_hours: number | null; notes: string | null
}
interface GLodging {
  id: string; day_id: string; name: string | null; type: string | null
  address: string | null; listing_url: string | null; confirmation_number: string | null
  check_in_time: string | null; check_out_time: string | null
  bedrooms: number | null; bathrooms: number | null; beds: number | null
  room_type: string | null; notes: string | null
}
interface GActivity {
  id: string; day_id: string; name: string | null; type: string | null
  meal_slot: string | null; time: string | null; address: string | null
  confirmation_number: string | null; url: string | null
  notes: string | null; is_booked: boolean; sort_order: number
}

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return null
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function fmtDateShort(s: string | null) {
  if (!s) return null
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtTime(s: string | null) {
  if (!s) return null
  const [h, m] = s.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

const MEAL_ICONS: Record<string, string> = { breakfast: '🍳', lunch: '🥗', dinner: '🍽️', snack: '🍎' }
const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner']

// ── DayCard ────────────────────────────────────────────────────────────────────

function DayCard({ day, lodging, activities }: { day: GDay; lodging: GLodging | null; activities: GActivity[] }) {
  const [expanded, setExpanded] = useState(false)

  const meals = activities.filter((a) => a.type === 'meal')
  const plans = activities.filter((a) => a.type !== 'meal')

  const hasContent = lodging || activities.length > 0

  return (
    <div className="card">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left"
        disabled={!hasContent}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-deep-teal bg-deep-teal/10 rounded px-1.5 py-0.5 shrink-0">
                Day {day.day_number}
              </span>
              {day.date && (
                <span className="text-xs text-forest/50">{fmtDate(day.date)}</span>
              )}
            </div>
            {(day.start_location || day.end_location) && (
              <p className="text-base font-medium text-forest mt-1 truncate">
                {day.start_location || '?'} → {day.end_location || '?'}
              </p>
            )}
            {(day.departure_time || day.drive_miles || day.drive_hours) && (
              <p className="text-xs text-forest/50 mt-0.5">
                {day.departure_time ? `Leave ${fmtTime(day.departure_time)}` : ''}
                {day.departure_time && (day.drive_miles || day.drive_hours) ? ' · ' : ''}
                {day.drive_miles ? `${day.drive_miles} mi` : ''}
                {day.drive_miles && day.drive_hours ? ' · ' : ''}
                {day.drive_hours ? `${day.drive_hours} hrs drive` : ''}
              </p>
            )}
          </div>
          {hasContent && (
            <span className="text-forest/30 text-sm mt-1 shrink-0">{expanded ? '▲' : '▼'}</span>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-forest/10 space-y-4">

          {/* Lodging */}
          {lodging && (
            <div>
              <p className="section-label mb-2">Lodging</p>
              <div className="bg-cream rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-forest">{lodging.name}</p>
                    <p className="text-xs text-forest/50 mt-0.5">
                      {lodging.type}
                      {lodging.room_type ? ` · ${lodging.room_type}` : ''}
                    </p>
                    {(lodging.beds || lodging.bedrooms || lodging.bathrooms) && (
                      <p className="text-xs text-forest/50 mt-0.5">
                        {[
                          lodging.beds ? `${lodging.beds} bed${lodging.beds !== 1 ? 's' : ''}` : null,
                          lodging.bedrooms ? `${lodging.bedrooms} BR` : null,
                          lodging.bathrooms ? `${lodging.bathrooms} BA` : null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {(lodging.check_in_time || lodging.check_out_time) && (
                      <p className="text-xs text-forest/60 mt-1">
                        Check-in {fmtTime(lodging.check_in_time) ?? '—'} · Check-out {fmtTime(lodging.check_out_time) ?? '—'}
                      </p>
                    )}
                    {lodging.address && (
                      <p className="text-xs text-forest/50 mt-0.5">{lodging.address}</p>
                    )}
                  </div>
                  {lodging.listing_url && (
                    <a
                      href={lodging.listing_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-sage underline shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View ↗
                    </a>
                  )}
                </div>
                {lodging.confirmation_number && (
                  <p className="text-xs font-mono text-forest/40 mt-2">#{lodging.confirmation_number}</p>
                )}
              </div>
            </div>
          )}

          {/* Meals */}
          {meals.length > 0 && (
            <div>
              <p className="section-label mb-2">Meals</p>
              <div className="bg-cream rounded-lg divide-y divide-forest/5">
                {MEAL_SLOTS.map((slot) => {
                  const meal = meals.find((a) => a.meal_slot === slot)
                  if (!meal) return null
                  return (
                    <div key={slot} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="text-base">{MEAL_ICONS[slot]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-forest truncate">{meal.name}</p>
                        <div className="flex gap-2 mt-0.5">
                          {meal.time && <span className="text-xs text-forest/50">{fmtTime(meal.time)}</span>}
                          {meal.is_booked && <span className="text-xs text-sage">✓ Booked</span>}
                        </div>
                      </div>
                      {meal.url && (
                        <a href={meal.url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-sage underline shrink-0"
                          onClick={(e) => e.stopPropagation()}>
                          Reserve ↗
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Activities */}
          {plans.length > 0 && (
            <div>
              <p className="section-label mb-2">Activities</p>
              <div className="bg-cream rounded-lg divide-y divide-forest/5">
                {plans.map((a) => (
                  <div key={a.id} className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-forest truncate">{a.name}</p>
                          {a.type === 'side_quest' && (
                            <span className="text-xs text-gold bg-gold/10 rounded px-1.5 py-0.5 shrink-0">Side quest</span>
                          )}
                          {a.is_booked && <span className="text-xs text-sage shrink-0">✓ Booked</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-2 mt-0.5">
                          {a.time && <span className="text-xs text-forest/50">{fmtTime(a.time)}</span>}
                          {a.address && <span className="text-xs text-forest/50 truncate">{a.address}</span>}
                        </div>
                      </div>
                      {a.url && (
                        <a href={a.url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-sage underline shrink-0"
                          onClick={(e) => e.stopPropagation()}>↗</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Day notes */}
          {day.notes && (
            <p className="text-xs text-forest/50 italic">{day.notes}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── TripHeader ─────────────────────────────────────────────────────────────────

function TripHeader({ trip }: { trip: GTrip }) {
  const status = useMemo(() => {
    if (!trip.start_date) return null
    const start = new Date(trip.start_date + 'T00:00:00')
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const diff = Math.floor((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff > 1) return `${diff} days until departure`
    if (diff === 1) return 'Departing tomorrow!'
    if (diff === 0) return 'Trip starts today!'
    const dayNum = Math.abs(diff) + 1
    if (trip.num_days && dayNum > trip.num_days) return 'Trip complete'
    return `Day ${dayNum} of ${trip.num_days ?? '?'}`
  }, [trip])

  return (
    <div className="mb-5">
      <h1 className="font-display text-2xl text-forest leading-tight">{trip.name}</h1>
      {(trip.start_date || trip.end_date) && (
        <p className="text-sm text-forest/60 mt-1">
          {[fmtDateShort(trip.start_date), fmtDateShort(trip.end_date)].filter(Boolean).join(' – ')}
          {trip.num_days ? ` · ${trip.num_days} days` : ''}
        </p>
      )}
      {status && (
        <div className="inline-block mt-2 text-xs font-medium text-deep-teal bg-deep-teal/10 rounded-full px-3 py-1">
          {status}
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GuestDaysPage() {
  const { shareCode } = useParams<{ shareCode: string }>()

  const { data: tripArr = [], isLoading: tripLoading } = useQuery({
    queryKey: ['guest_trip', shareCode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('guest_get_trip', { p_share_code: shareCode! })
      if (error) throw error
      return (data ?? []) as GTrip[]
    },
    enabled: !!shareCode,
  })

  const trip = tripArr[0] ?? null

  const { data: days = [] } = useQuery({
    queryKey: ['guest_days', shareCode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('guest_get_days', { p_share_code: shareCode! })
      if (error) throw error
      return ((data ?? []) as GDay[]).sort((a, b) => a.day_number - b.day_number)
    },
    enabled: !!trip,
  })

  const { data: allLodging = [] } = useQuery({
    queryKey: ['guest_lodging', shareCode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('guest_get_lodging', { p_share_code: shareCode! })
      if (error) throw error
      return (data ?? []) as GLodging[]
    },
    enabled: !!trip,
  })

  const { data: allActivities = [] } = useQuery({
    queryKey: ['guest_activities', shareCode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('guest_get_activities', { p_share_code: shareCode! })
      if (error) throw error
      return (data ?? []) as GActivity[]
    },
    enabled: !!trip,
  })

  const lodgingByDay = useMemo(() => {
    const map: Record<string, GLodging> = {}
    for (const l of allLodging) map[l.day_id] = l
    return map
  }, [allLodging])

  const activitiesByDay = useMemo(() => {
    const map: Record<string, GActivity[]> = {}
    for (const a of allActivities) {
      if (!map[a.day_id]) map[a.day_id] = []
      map[a.day_id].push(a)
    }
    return map
  }, [allActivities])

  if (tripLoading) {
    return (
      <div className="p-4 pt-6 flex justify-center py-20">
        <p className="text-forest/40 text-sm">Loading…</p>
      </div>
    )
  }

  if (!trip || !trip.share_enabled) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-3">
        <img src="/logo.png" alt="WanderWisely" className="w-16 h-16 mb-2 opacity-50" />
        <p className="font-display text-xl text-forest">Trip not available</p>
        <p className="text-sm text-forest/50">This trip link is no longer active or the code is invalid.</p>
      </div>
    )
  }

  return (
    <div className="p-4 pt-6 pb-10">
      <TripHeader trip={trip} />

      {days.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-forest/50 text-sm">No days added yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {days.map((day) => (
            <DayCard
              key={day.id}
              day={day}
              lodging={lodgingByDay[day.id] ?? null}
              activities={activitiesByDay[day.id] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  )
}
