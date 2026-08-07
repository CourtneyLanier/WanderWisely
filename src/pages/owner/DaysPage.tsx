import { useMemo } from 'react'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { calcDriveTime } from '@/lib/routing'
import { dayTitle } from '@/lib/dayTitle'
import { useAppStore } from '@/store/useAppStore'
import { useTrip } from '@/hooks/useTrip'
import type { Day } from '@/types'

const RES_ICONS: Record<string, string> = {
  flight: '✈️', hotel: '🏨', car: '🚗', restaurant: '🍴', activity: '🎯', other: '📋',
}

function fmt(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default function DaysPage() {
  const tripId = useAppStore((s) => s.tripId)
  const { data: trip, isLoading: tripLoading } = useTrip()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: days = [], isLoading: daysLoading } = useQuery({
    queryKey: ['days', tripId],
    queryFn: async (): Promise<Day[]> => {
      const { data, error } = await supabase
        .from('days').select('*').eq('trip_id', tripId!).order('day_number')
      if (error) throw error
      return data ?? []
    },
    enabled: !!tripId,
  })

  // Reservations for emoji icons on each card
  const { data: reservations = [] } = useQuery({
    queryKey: ['reservations', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reservations').select('id, type, date').eq('trip_id', tripId!)
      if (error) throw error
      return (data ?? []) as { id: string; type: string; date: string | null }[]
    },
    enabled: !!tripId,
  })

  // Hotel reservations with addresses — for route fallback display (same logic as RoutePage)
  const { data: hotelRes = [] } = useQuery({
    queryKey: ['hotel-res-days', tripId],
    queryFn: async () => {
      const { data } = await supabase
        .from('reservations').select('date, address')
        .eq('trip_id', tripId!).eq('type', 'hotel').not('address', 'is', null)
      return (data ?? []) as { date: string; address: string }[]
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

  // Lodging listing URLs — for showing links on each card
  const { data: lodgingData = [] } = useQuery({
    queryKey: ['lodging-listing-days', tripId, days.map(d => d.id).join(',')],
    queryFn: async () => {
      const dayIds = days.map(d => d.id)
      if (!dayIds.length) return []
      const { data } = await supabase
        .from('lodging').select('day_id, listing_url, name')
        .in('day_id', dayIds).not('listing_url', 'is', null)
      return (data ?? []) as { day_id: string; listing_url: string; name: string | null }[]
    },
    enabled: !!tripId && days.length > 0,
  })

  const lodgingByDayId = useMemo(() => {
    const map: Record<string, { listing_url: string; name: string | null }> = {}
    for (const l of lodgingData) map[l.day_id] = l
    return map
  }, [lodgingData])

  // Also check hotel reservation listing_urls
  const { data: hotelListingRes = [] } = useQuery({
    queryKey: ['hotel-listing-res-days', tripId],
    queryFn: async () => {
      const { data } = await supabase
        .from('reservations').select('date, listing_url, title, provider')
        .eq('trip_id', tripId!).eq('type', 'hotel').not('listing_url', 'is', null)
      return (data ?? []) as { date: string; listing_url: string; title: string | null; provider: string | null }[]
    },
    enabled: !!tripId,
  })

  const hotelListingByDate = useMemo(() => {
    const map: Record<string, { listing_url: string; name: string }> = {}
    for (const r of hotelListingRes) {
      if (r.date) map[r.date] = { listing_url: r.listing_url, name: r.title || r.provider || 'View listing' }
    }
    return map
  }, [hotelListingRes])

  const autoFillAllMutation = useMutation({
    mutationFn: async () => {
      if (!tripId) throw new Error('No trip')

      // Fetch all reservations with addresses
      const { data: resList } = await supabase
        .from('reservations').select('date, type, address')
        .eq('trip_id', tripId).not('address', 'is', null)
      const resData = (resList ?? []) as { date: string | null; type: string; address: string }[]

      const byDate: Record<string, { hotel?: string; any?: string }> = {}
      for (const r of resData) {
        if (!r.date) continue
        if (!byDate[r.date]) byDate[r.date] = {}
        if (r.type === 'hotel' && !byDate[r.date].hotel) byDate[r.date].hotel = r.address
        if (!byDate[r.date].any) byDate[r.date].any = r.address
      }

      const sorted = [...days].sort((a, b) => a.day_number - b.day_number)
      let prevEnd: string | null = null

      for (const day of sorted) {
        const needsStart = !day.start_location
        const needsEnd = !day.end_location
        const needsMiles = day.drive_miles == null
        const needsHours = day.drive_hours == null

        const dateEntry = day.date ? byDate[day.date] : undefined
        const suggestedEnd = dateEntry?.hotel ?? dateEntry?.any ?? null
        const suggestedStart = prevEnd

        const updates: {
          start_location?: string
          end_location?: string
          drive_miles?: number
          drive_hours?: number
        } = {}

        if (needsStart && suggestedStart) updates.start_location = suggestedStart
        if (needsEnd && suggestedEnd) updates.end_location = suggestedEnd

        // Calculate drive time if we now have both locations and are missing miles/hours
        const effectiveStart = updates.start_location ?? day.start_location
        const effectiveEnd = updates.end_location ?? day.end_location
        if (effectiveStart && effectiveEnd && (needsMiles || needsHours)) {
          const driveInfo = await calcDriveTime(effectiveStart, effectiveEnd)
          if (driveInfo) {
            if (needsMiles) updates.drive_miles = driveInfo.miles
            if (needsHours) updates.drive_hours = driveInfo.hours
          }
        }

        if (Object.keys(updates).length > 0) {
          await supabase.from('days').update(updates).eq('id', day.id)
        }

        prevEnd = updates.end_location ?? day.end_location ?? null
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['days', tripId] })
    },
  })

  const addDayMutation = useMutation({
    mutationFn: async () => {
      if (!tripId) throw new Error('No trip')
      const nextNum = days.length > 0 ? Math.max(...days.map((d) => d.day_number)) + 1 : 1

      let date: string | null = null
      if (trip?.start_date) {
        const d = new Date(trip.start_date)
        d.setDate(d.getDate() + nextNum - 1)
        date = d.toISOString().split('T')[0]
      }

      const { data, error } = await supabase
        .from('days').insert({ trip_id: tripId, day_number: nextNum, date }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (newDay) => {
      queryClient.invalidateQueries({ queryKey: ['days', tripId] })
      navigate(`/days/${newDay.id}`)
    },
  })

  const isLoading = tripLoading || daysLoading

  if (isLoading) {
    return (
      <div className="p-4 pt-6 flex justify-center py-20">
        <p className="text-forest/40 text-sm">Loading…</p>
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="p-4 pt-6">
        <h1 className="font-display text-2xl text-forest mb-4">Day by Day</h1>
        <div className="card text-center py-12 space-y-3">
          <p className="text-forest/50 text-sm">No trip yet.</p>
          <Link to="/settings" className="btn-primary inline-block">
            Create your trip first
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl text-forest">Day by Day</h1>
        <div className="flex items-center gap-2">
          {days.length > 0 && (
            <button
              onClick={() => autoFillAllMutation.mutate()}
              disabled={autoFillAllMutation.isPending}
              className="text-xs text-deep-teal hover:text-forest transition-colors"
              title="Fill missing routes and calculate drive times"
            >
              {autoFillAllMutation.isPending ? 'Filling…' : '✨ Auto-fill'}
            </button>
          )}
          <button
            onClick={() => addDayMutation.mutate()}
            disabled={addDayMutation.isPending}
            className="btn-primary text-sm px-3 py-1.5"
          >
            {addDayMutation.isPending ? '…' : '+ Add Day'}
          </button>
        </div>
      </div>

      {addDayMutation.isError && (
        <p className="text-sm text-terracotta mb-3">
          {(addDayMutation.error as Error).message}
        </p>
      )}

      {autoFillAllMutation.isError && (
        <p className="text-sm text-terracotta mb-3">
          {(autoFillAllMutation.error as Error).message}
        </p>
      )}

      {days.length === 0 ? (
        <div className="card text-center py-12 space-y-3">
          <p className="text-forest/50 text-sm">No days yet.</p>
          <button
            onClick={() => addDayMutation.mutate()}
            disabled={addDayMutation.isPending}
            className="btn-primary"
          >
            Add your first day
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {days.map((day, i) => {
            const dayRes = reservations.filter((r) => r.date === day.date)

            // Effective route — use hotel address fallback if day locations not set (same as RoutePage)
            const prevDay = i > 0 ? days[i - 1] : null
            const effectiveStart = day.start_location
              || (prevDay?.date ? hotelByDate[prevDay.date] ?? null : null)
            const effectiveEnd = day.end_location
              || (day.date ? hotelByDate[day.date] ?? null : null)
            const routeFromWallet = (!day.start_location && !!effectiveStart)
              || (!day.end_location && !!effectiveEnd)

            // Lodging link — prefer manual lodging entry, fall back to hotel reservation
            const lodging = lodgingByDayId[day.id]
            const hotelListing = day.date ? hotelListingByDate[day.date] : undefined
            const listingUrl = lodging?.listing_url || hotelListing?.listing_url
            const listingName = lodging?.name || hotelListing?.name || 'View listing'

            return (
              <Link
                key={day.id}
                to={`/days/${day.id}`}
                className="card block hover:bg-cream transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-deep-teal bg-deep-teal/[0.09] rounded-md px-1.5 py-0.5 font-sans tracking-wide">
                        Day {day.day_number}
                      </span>
                      <span className="text-xs text-forest/50">{fmt(day.date)}</span>
                    </div>

                    {(effectiveStart || effectiveEnd) ? (
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-medium ${routeFromWallet ? 'text-forest/60' : 'text-forest'}`}>
                          {dayTitle(effectiveStart, effectiveEnd)}
                        </p>
                        {routeFromWallet && (
                          <span className="text-[10px] text-deep-teal/60 bg-deep-teal/8 rounded px-1 py-px shrink-0">wallet</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-forest/40 italic">No route set</p>
                    )}

                    {(day.drive_miles || day.drive_hours || day.departure_time) && (
                      <p className="text-xs text-forest/50 mt-0.5">
                        {day.departure_time ? `Leave ${day.departure_time.slice(0, 5)}` : ''}
                        {day.departure_time && (day.drive_miles || day.drive_hours) ? ' · ' : ''}
                        {day.drive_miles ? `${day.drive_miles} mi` : ''}
                        {day.drive_miles && day.drive_hours ? ' · ' : ''}
                        {day.drive_hours ? `${day.drive_hours} hrs` : ''}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-1">
                      {dayRes.length > 0 && (
                        <div className="flex gap-1">
                          {dayRes.map((r) => (
                            <span key={r.id} className="text-sm" title={r.type}>
                              {RES_ICONS[r.type] ?? '📋'}
                            </span>
                          ))}
                        </div>
                      )}
                      {listingUrl && (
                        <a
                          href={listingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-deep-teal hover:text-forest transition-colors"
                        >
                          🔗 {listingName}
                        </a>
                      )}
                    </div>
                  </div>
                  <span className="text-forest/30 text-sm mt-0.5 ml-2">›</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
