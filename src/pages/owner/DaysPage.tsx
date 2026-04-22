import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
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
        .from('days')
        .select('*')
        .eq('trip_id', tripId!)
        .order('day_number')
      if (error) throw error
      return data ?? []
    },
    enabled: !!tripId,
  })

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

  const addDayMutation = useMutation({
    mutationFn: async () => {
      if (!tripId) throw new Error('No trip')
      const nextNum = days.length > 0 ? Math.max(...days.map((d) => d.day_number)) + 1 : 1

      // Compute date from trip start_date + offset
      let date: string | null = null
      if (trip?.start_date) {
        const d = new Date(trip.start_date)
        d.setDate(d.getDate() + nextNum - 1)
        date = d.toISOString().split('T')[0]
      }

      const { data, error } = await supabase
        .from('days')
        .insert({ trip_id: tripId, day_number: nextNum, date })
        .select()
        .single()
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
        <button
          onClick={() => addDayMutation.mutate()}
          disabled={addDayMutation.isPending}
          className="btn-primary text-sm px-3 py-1.5"
        >
          {addDayMutation.isPending ? '…' : '+ Add Day'}
        </button>
      </div>

      {addDayMutation.isError && (
        <p className="text-sm text-terracotta mb-3">
          {(addDayMutation.error as Error).message}
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
          {days.map((day) => {
            const dayRes = reservations.filter((r) => r.date === day.date)
            return (
              <Link
                key={day.id}
                to={`/days/${day.id}`}
                className="card block hover:bg-cream transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-deep-teal bg-deep-teal/[0.09] rounded-md px-1.5 py-0.5 font-sans tracking-wide">
                        Day {day.day_number}
                      </span>
                      <span className="text-xs text-forest/50">{fmt(day.date)}</span>
                    </div>

                    {(day.start_location || day.end_location) ? (
                      <p className="text-sm font-medium text-forest">
                        {day.start_location || '?'} → {day.end_location || '?'}
                      </p>
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

                    {dayRes.length > 0 && (
                      <div className="flex gap-1 mt-1.5">
                        {dayRes.map((r) => (
                          <span key={r.id} className="text-sm" title={r.type}>
                            {RES_ICONS[r.type] ?? '📋'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-forest/30 text-sm mt-0.5">›</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
