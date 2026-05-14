import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── types ──────────────────────────────────────────────────────────────────────

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

function fmtTime(s: string | null) {
  if (!s) return null
  const [h, m] = s.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDateShort(s: string | null) {
  if (!s) return null
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const MEAL_ICONS: Record<string, string> = { breakfast: '🍳', lunch: '🥗', dinner: '🍽️', snack: '🍎' }
const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack']

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GuestHomePage() {
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

  const todayStr = new Date().toISOString().split('T')[0]

  const { status, currentDay, daysUntil } = useMemo(() => {
    if (!trip?.start_date) return { status: 'unknown' as const, currentDay: null, daysUntil: null }
    const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0)
    const start = new Date(trip.start_date + 'T00:00:00')
    const diff = Math.floor((start.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24))
    if (diff > 0) return { status: 'pre' as const, currentDay: null, daysUntil: diff }
    const dayNum = Math.abs(diff) + 1
    if (trip.num_days && dayNum > trip.num_days) return { status: 'post' as const, currentDay: null, daysUntil: null }
    const todayDay = days.find((d) => d.date === todayStr) ?? days[Math.abs(diff)] ?? null
    return { status: 'active' as const, currentDay: todayDay, daysUntil: null }
  }, [trip, days, todayStr])

  const todayLodging = currentDay ? allLodging.find((l) => l.day_id === currentDay.id) ?? null : null
  const todayMeals = currentDay
    ? allActivities.filter((a) => a.day_id === currentDay.id && a.type === 'meal')
    : []

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

  // ── Pre-trip countdown ──────────────────────────────────────────────────────

  if (status === 'pre') {
    const day1 = days[0] ?? null
    return (
      <div className="p-4 pt-6 pb-10">
        <div className="text-center pt-8 pb-10">
          <p className="text-xs text-forest/40 uppercase tracking-widest mb-3">Get ready for</p>
          <h1 className="font-display text-3xl text-forest leading-tight mb-1">{trip.name}</h1>
          {(trip.start_date || trip.end_date) && (
            <p className="text-sm text-forest/60">
              {[fmtDateShort(trip.start_date), fmtDateShort(trip.end_date)].filter(Boolean).join(' – ')}
              {trip.num_days ? ` · ${trip.num_days} days` : ''}
            </p>
          )}
          <div className="mt-10">
            <p className="text-8xl font-display text-deep-teal leading-none">{daysUntil}</p>
            <p className="text-base text-forest/60 mt-3">
              {daysUntil === 1 ? 'day until departure' : 'days until departure'}
            </p>
          </div>
        </div>

        {day1 && (day1.start_location || day1.end_location || day1.drive_hours) && (
          <div className="card">
            <p className="section-label mb-3">Day 1 preview</p>
            {(day1.start_location || day1.end_location) && (
              <p className="text-base font-medium text-forest">
                {day1.start_location || '?'} → {day1.end_location || '?'}
              </p>
            )}
            {(day1.departure_time || day1.drive_miles || day1.drive_hours) && (
              <p className="text-xs text-forest/50 mt-1">
                {day1.departure_time ? `Depart ${fmtTime(day1.departure_time)}` : ''}
                {day1.departure_time && (day1.drive_miles || day1.drive_hours) ? ' · ' : ''}
                {day1.drive_hours ? `${day1.drive_hours} hrs` : ''}
                {day1.drive_hours && day1.drive_miles ? ' · ' : ''}
                {day1.drive_miles ? `${day1.drive_miles} mi` : ''}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Post-trip ───────────────────────────────────────────────────────────────

  if (status === 'post') {
    return (
      <div className="p-4 pt-6 pb-10 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-6xl mb-5">🏁</p>
        <h1 className="font-display text-2xl text-forest mb-2">{trip.name}</h1>
        <p className="text-forest/50 text-sm">What a trip! Adventure complete.</p>
      </div>
    )
  }

  // ── Active trip — today's snapshot ─────────────────────────────────────────

  if (status === 'active' && currentDay) {
    const hasRoute = currentDay.start_location || currentDay.end_location
    const mapsUrl = (currentDay.start_location && currentDay.end_location)
      ? `https://www.google.com/maps/dir/${encodeURIComponent(currentDay.start_location)}/${encodeURIComponent(currentDay.end_location)}`
      : null

    return (
      <div className="p-4 pt-6 pb-10 space-y-4">

        {/* Day header */}
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-medium text-white bg-deep-teal rounded-full px-2.5 py-0.5">Today</span>
            <span className="text-xs font-medium text-deep-teal bg-deep-teal/10 rounded px-1.5 py-0.5">
              Day {currentDay.day_number}{trip.num_days ? ` of ${trip.num_days}` : ''}
            </span>
          </div>
          <h1 className="font-display text-2xl text-forest">{trip.name}</h1>
        </div>

        {/* Today's drive */}
        {hasRoute && (
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <p className="section-label">Today's drive</p>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-sage underline">Open in Maps ↗</a>
              )}
            </div>
            <div className="space-y-1">
              {currentDay.start_location && (
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-sage shrink-0" />
                  <p className="text-sm text-forest">{currentDay.start_location}</p>
                </div>
              )}
              {currentDay.start_location && currentDay.end_location && (
                <div className="pl-[4px]"><div className="w-px h-4 bg-forest/20 ml-[1px]" /></div>
              )}
              {currentDay.end_location && (
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-terracotta/70 shrink-0" />
                  <p className="text-sm text-forest">{currentDay.end_location}</p>
                </div>
              )}
            </div>
            {(currentDay.drive_hours || currentDay.drive_miles || currentDay.departure_time) && (
              <div className="bg-deep-teal/[0.06] rounded-lg px-3 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-forest">
                {currentDay.departure_time && (
                  <span>🕐 Depart <strong>{fmtTime(currentDay.departure_time)}</strong></span>
                )}
                {currentDay.drive_hours && (
                  <span>⏱ <strong>{currentDay.drive_hours} hrs</strong></span>
                )}
                {currentDay.drive_miles && (
                  <span>📍 <strong>{currentDay.drive_miles} mi</strong></span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tonight's lodging */}
        {todayLodging && (
          <div className="card space-y-2">
            <p className="section-label">Tonight's lodging</p>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-forest leading-snug">{todayLodging.name}</p>
                {todayLodging.room_type && (
                  <p className="text-xs text-forest/50 mt-0.5">{todayLodging.room_type}</p>
                )}
              </div>
              {todayLodging.listing_url && (
                <a href={todayLodging.listing_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-medium text-white bg-deep-teal rounded-md px-2.5 py-1 shrink-0 hover:bg-forest transition-colors">
                  View listing ↗
                </a>
              )}
            </div>
            {(todayLodging.check_in_time || todayLodging.check_out_time) && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-cream rounded-lg px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-forest/40 font-medium mb-0.5">Check-in</p>
                  <p className="text-sm font-semibold text-forest">{fmtTime(todayLodging.check_in_time) ?? '—'}</p>
                </div>
                <div className="bg-cream rounded-lg px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-forest/40 font-medium mb-0.5">Check-out</p>
                  <p className="text-sm font-semibold text-forest">{fmtTime(todayLodging.check_out_time) ?? '—'}</p>
                </div>
              </div>
            )}
            {(todayLodging.confirmation_number || todayLodging.address) && (
              <div className="flex flex-wrap gap-2">
                {todayLodging.confirmation_number && (
                  <span className="text-xs font-mono text-forest/50 bg-cream rounded px-2 py-1">
                    #{todayLodging.confirmation_number}
                  </span>
                )}
                {todayLodging.address && (
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(todayLodging.address)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-deep-teal">📍 Map</a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Meal plan */}
        {todayMeals.length > 0 && (
          <div className="card space-y-2">
            <p className="section-label">Meal plan</p>
            <div className="bg-cream rounded-lg divide-y divide-forest/5">
              {MEAL_SLOTS.map((slot) => {
                const meal = todayMeals.find((a) => a.meal_slot === slot)
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
                        className="text-xs text-sage underline shrink-0">Reserve ↗</a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!hasRoute && !todayLodging && todayMeals.length === 0 && (
          <div className="card text-center py-10">
            <p className="text-forest/40 text-sm">Details for today haven't been added yet.</p>
          </div>
        )}
      </div>
    )
  }

  // Fallback
  return (
    <div className="p-4 pt-6 pb-10">
      <h1 className="font-display text-2xl text-forest mb-4">{trip.name}</h1>
      <div className="card text-center py-10">
        <p className="text-forest/40 text-sm">Check the Days tab for your full itinerary.</p>
      </div>
    </div>
  )
}
