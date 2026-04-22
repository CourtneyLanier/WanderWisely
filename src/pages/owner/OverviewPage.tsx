import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useTrip } from '@/hooks/useTrip'
import type { Budget, SpendingLog, Day, Lodging, Activity, Reservation } from '@/types'

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - Date.now()) / 86400000)
}

function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtTime(t: string | null | undefined) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

// ── TodayCard ──────────────────────────────────────────────────────────────────

function TodayCard({ day }: { day: Day }) {
  const { data: lodging } = useQuery({
    queryKey: ['lodging', day.id],
    queryFn: async (): Promise<Lodging | null> => {
      const { data, error } = await supabase.from('lodging').select('*').eq('day_id', day.id).maybeSingle()
      if (error) throw error
      return data
    },
  })

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', day.id],
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase
        .from('activities').select('*').eq('day_id', day.id).order('sort_order').order('time')
      if (error) throw error
      return data ?? []
    },
  })

  const stopsWithAddress = useMemo(
    () => activities.filter((a) => a.address),
    [activities]
  )

  const hasAnything = day.start_location || day.end_location || day.drive_hours || lodging || stopsWithAddress.length > 0

  return (
    <div className="card space-y-4">
      {/* Drive info */}
      {(day.start_location || day.end_location || day.drive_hours || day.drive_miles) && (
        <div>
          <p className="section-label mb-2">Today's Drive</p>
          {(day.start_location || day.end_location) && (
            <p className="text-base font-medium text-forest">
              {day.start_location || '?'} → {day.end_location || '?'}
            </p>
          )}
          <div className="flex flex-wrap gap-x-3 mt-1 text-sm text-forest/60">
            {day.departure_time && (
              <span>Leave {fmtTime(day.departure_time)}</span>
            )}
            {day.drive_hours != null && (
              <span>{day.drive_hours} hrs</span>
            )}
            {day.drive_miles != null && (
              <span>{day.drive_miles} mi</span>
            )}
          </div>
          {day.notes && (
            <p className="text-xs text-forest/50 mt-1 italic">{day.notes}</p>
          )}
        </div>
      )}

      {/* Tonight's lodging */}
      {lodging && (
        <div className={day.start_location || day.end_location || day.drive_hours ? 'border-t border-forest/10 pt-4' : ''}>
          <p className="section-label mb-2">Tonight's Lodging</p>
          <p className="font-medium text-forest">{lodging.name}</p>
          <p className="text-xs text-forest/50 capitalize mt-0.5">
            {lodging.type}{lodging.room_type ? ` · ${lodging.room_type}` : ''}
          </p>
          {(lodging.check_in_time || lodging.check_out_time) && (
            <p className="text-xs text-forest/60 mt-1">
              {lodging.check_in_time ? `Check-in ${fmtTime(lodging.check_in_time)}` : ''}
              {lodging.check_in_time && lodging.check_out_time ? ' · ' : ''}
              {lodging.check_out_time ? `Check-out ${fmtTime(lodging.check_out_time)}` : ''}
            </p>
          )}
          {lodging.confirmation_number && (
            <p className="text-xs text-forest/40 font-mono mt-0.5">#{lodging.confirmation_number}</p>
          )}
          {lodging.address && (
            <a
              href={mapsUrl(lodging.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-1.5 text-xs text-deep-teal hover:text-forest transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              {lodging.address}
            </a>
          )}
          {lodging.notes && (
            <p className="text-xs text-forest/50 mt-1 italic">{lodging.notes}</p>
          )}
        </div>
      )}

      {/* Stops & places with addresses */}
      {stopsWithAddress.length > 0 && (
        <div className={(day.start_location || day.end_location || day.drive_hours || lodging) ? 'border-t border-forest/10 pt-4' : ''}>
          <p className="section-label mb-2">Stops & Places</p>
          <div className="space-y-3">
            {stopsWithAddress.map((a) => (
              <div key={a.id}>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-forest">{a.name}</p>
                  {a.time && <span className="text-xs text-forest/40">{fmtTime(a.time)}</span>}
                  {a.is_booked && <span className="text-xs text-sage">✓</span>}
                </div>
                {a.address && (
                  <a
                    href={mapsUrl(a.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-deep-teal hover:text-forest transition-colors mt-0.5"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                    {a.address}
                  </a>
                )}
                {a.confirmation_number && (
                  <p className="text-xs text-forest/40 font-mono">#{a.confirmation_number}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasAnything && (
        <p className="text-sm text-forest/40 text-center py-4">Nothing planned yet for today.</p>
      )}

      <div className="border-t border-forest/10 pt-3">
        <Link
          to={`/days/${day.id}`}
          className="flex items-center justify-between text-sm text-deep-teal hover:text-forest transition-colors"
        >
          <span>Full day details</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const tripId = useAppStore((s) => s.tripId)
  const { data: trip, isLoading } = useTrip()
  const activeTripId = trip?.id ?? tripId
  const queryClient = useQueryClient()
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [lastSynced, setLastSynced] = useState<Date | null>(null)

  const { data: budget } = useQuery({
    queryKey: ['budget', activeTripId],
    queryFn: async (): Promise<Budget | null> => {
      const { data, error } = await supabase.from('budget').select('*').eq('trip_id', activeTripId!).maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!activeTripId,
  })

  const { data: spending = [] } = useQuery({
    queryKey: ['spending', activeTripId],
    queryFn: async (): Promise<SpendingLog[]> => {
      const { data, error } = await supabase.from('spending_log').select('*').eq('trip_id', activeTripId!)
      if (error) throw error
      return data ?? []
    },
    enabled: !!activeTripId,
  })

  const { data: days = [] } = useQuery({
    queryKey: ['days', activeTripId],
    queryFn: async (): Promise<Day[]> => {
      const { data, error } = await supabase
        .from('days').select('*').eq('trip_id', activeTripId!).order('day_number')
      if (error) throw error
      return data ?? []
    },
    enabled: !!activeTripId,
  })

  const { data: reservations = [] } = useQuery({
    queryKey: ['reservations', activeTripId],
    queryFn: async (): Promise<Reservation[]> => {
      const { data, error } = await supabase.from('reservations').select('*').eq('trip_id', activeTripId!)
      if (error) throw error
      return data ?? []
    },
    enabled: !!activeTripId,
  })

  async function syncOffline() {
    if (!activeTripId || !navigator.onLine) return
    setSyncState('syncing')
    try {
      // Refetch all top-level trip queries
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['days', activeTripId] }),
        queryClient.refetchQueries({ queryKey: ['reservations', activeTripId] }),
        queryClient.refetchQueries({ queryKey: ['budget', activeTripId] }),
        queryClient.refetchQueries({ queryKey: ['spending_log', activeTripId] }),
        queryClient.refetchQueries({ queryKey: ['spending', activeTripId] }),
      ])

      // Fetch lodging + activities for every day
      await Promise.all(
        days.flatMap((d) => [
          queryClient.prefetchQuery({
            queryKey: ['lodging', d.id],
            queryFn: async () => {
              const { data, error } = await supabase.from('lodging').select('*').eq('day_id', d.id).maybeSingle()
              if (error) throw error
              return data
            },
          }),
          queryClient.prefetchQuery({
            queryKey: ['activities', d.id],
            queryFn: async () => {
              const { data, error } = await supabase.from('activities').select('*').eq('day_id', d.id).order('sort_order').order('time')
              if (error) throw error
              return data ?? []
            },
          }),
        ])
      )

      // Warm Workbox cache for all PDF files
      const pdfUrls = reservations.filter((r) => r.pdf_url).map((r) => r.pdf_url!)
      await Promise.all(pdfUrls.map((url) => fetch(url, { cache: 'force-cache' }).catch(() => null)))

      setLastSynced(new Date())
      setSyncState('done')
    } catch {
      setSyncState('error')
    }
  }

  const today = todayYmd()
  const todayDay = useMemo(() => days.find((d) => d.date === today) ?? null, [days, today])

  const tripInProgress = useMemo(() => {
    if (!trip?.start_date || !trip?.end_date) return false
    return today >= trip.start_date && today <= trip.end_date
  }, [trip, today])

  const countdown = daysUntil(trip?.start_date ?? null)
  const countdownLabel =
    countdown === null ? 'Dates TBD'
    : countdown > 0 ? `${countdown} day${countdown !== 1 ? 's' : ''} to go`
    : countdown === 0 ? 'Trip starts today!'
    : 'Trip in progress'

  const dateRange =
    trip?.start_date && trip?.end_date
      ? `${new Date(trip.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(trip.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : 'Dates TBD'

  const currentDayNumber = todayDay?.day_number ?? null

  const foodSpent = spending.filter((s) => s.card === 'food').reduce((sum, s) => sum + s.amount, 0)
  const carSpent = spending.filter((s) => s.card === 'car').reduce((sum, s) => sum + s.amount, 0)
  const dailyBaseline = budget && budget.food_days > 0 ? budget.food_total / budget.food_days : 0
  const foodDaysLogged = new Set(spending.filter((s) => s.card === 'food' && s.day_id).map((s) => s.day_id)).size
  const foodCushion = dailyBaseline > 0 ? foodDaysLogged * dailyBaseline - foodSpent : null
  const carRemaining = budget ? budget.car_total_budget - carSpent : null
  const hotelOk = budget ? budget.hotel_total > 0 : false

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <p className="text-forest/40 text-sm">Loading…</p>
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="p-4 pt-6">
        <h1 className="font-display text-2xl text-forest mb-6">Welcome to WanderWisely</h1>
        <div className="card text-center py-10 space-y-3">
          <p className="text-forest/60 text-sm">No trip yet.</p>
          <Link to="/settings" className="btn-primary inline-block">Create your trip →</Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Hero */}
      <div className="bg-deep-teal px-4 pt-4 pb-5">
        <p className="text-white/50 text-[11px] uppercase tracking-widest mb-1 font-sans font-semibold">
          {dateRange}
        </p>
        <h1 className="font-display text-3xl text-white leading-tight">{trip.name}</h1>
        <div className="mt-3 inline-flex items-center gap-2 bg-white/10 rounded-full px-3 py-1">
          {tripInProgress && currentDayNumber ? (
            <span className="text-gold font-display text-base">
              Day {currentDayNumber} of {trip.num_days}
            </span>
          ) : (
            <span className="text-gold font-display text-base">{countdownLabel}</span>
          )}
          {!tripInProgress && trip.num_days && (
            <>
              <span className="text-white/30">·</span>
              <span className="text-white/60 text-xs">{trip.num_days} days</span>
            </>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4 pb-10">
        {/* Today's card — shown during trip */}
        {tripInProgress && todayDay && (
          <>
            <p className="section-label">Today</p>
            <TodayCard day={todayDay} />
          </>
        )}

        {/* In-progress but no day data for today */}
        {tripInProgress && !todayDay && (
          <div className="card text-center py-8 space-y-2">
            <p className="text-forest/50 text-sm">No day planned for today.</p>
            <Link to="/days" className="text-sm text-deep-teal underline">View all days →</Link>
          </div>
        )}

        {/* Budget health */}
        {budget && (
          <div className="card">
            <p className="section-label">Budget Health</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-forest/50 mb-1">Food cushion</p>
                {foodCushion !== null ? (
                  <p className={`font-mono text-base font-medium ${foodCushion >= 0 ? 'text-sage' : 'text-terracotta'}`}>
                    {foodCushion >= 0 ? '+' : ''}{fmt(foodCushion)}
                  </p>
                ) : (
                  <p className="font-mono text-base text-forest/30">—</p>
                )}
              </div>
              <div>
                <p className="text-xs text-forest/50 mb-1">Hotel</p>
                <p className={`text-sm font-medium ${hotelOk ? 'text-sage' : 'text-forest/30'}`}>
                  {hotelOk ? '✓ Set' : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-forest/50 mb-1">Car left</p>
                {carRemaining !== null && budget.car_total_budget > 0 ? (
                  <p className={`font-mono text-base font-medium ${carRemaining >= 0 ? 'text-forest' : 'text-terracotta'}`}>
                    {fmt(carRemaining)}
                  </p>
                ) : (
                  <p className="font-mono text-base text-forest/30">—</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Quick links */}
        {!tripInProgress && (
          <div className="grid grid-cols-2 gap-3">
            <Link to="/days" className="card flex flex-col items-center py-6 gap-2 hover:bg-cream transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-deep-teal">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span className="text-sm font-medium text-forest">View days</span>
            </Link>
            <Link to="/wallet" className="card flex flex-col items-center py-6 gap-2 hover:bg-cream transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-deep-teal">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
              <span className="text-sm font-medium text-forest">Wallet</span>
            </Link>
          </div>
        )}

        {/* During trip — smaller secondary nav */}
        {tripInProgress && (
          <div className="flex gap-3">
            <Link to="/days" className="btn-secondary flex-1 text-xs py-2.5 text-center">
              All days
            </Link>
            <Link to="/wallet" className="btn-secondary flex-1 text-xs py-2.5 text-center">
              Wallet
            </Link>
          </div>
        )}

        {/* Offline sync */}
        {activeTripId && (
          <div className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-forest text-sm">Offline sync</p>
                <p className="text-xs text-forest/50 mt-0.5">
                  {syncState === 'done' && lastSynced
                    ? `Synced at ${lastSynced.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} — ready for no-signal areas`
                    : 'Tap before entering a National Park or area with no signal'}
                </p>
                {syncState === 'error' && (
                  <p className="text-xs text-terracotta mt-0.5">Sync failed — check your connection and try again</p>
                )}
              </div>
              <button
                onClick={syncOffline}
                disabled={syncState === 'syncing' || !navigator.onLine}
                className="btn-primary text-xs px-3 py-1.5 shrink-0 ml-3"
              >
                {syncState === 'syncing' ? '⏳ Syncing…' : syncState === 'done' ? '✓ Sync again' : '⬇ Sync now'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
