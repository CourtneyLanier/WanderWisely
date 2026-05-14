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

// ── helpers ────────────────────────────────────────────────────────────────────

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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GuestRoutePage() {
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

  const { data: days = [], isLoading: daysLoading } = useQuery({
    queryKey: ['guest_days', shareCode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('guest_get_days', { p_share_code: shareCode! })
      if (error) throw error
      return ((data ?? []) as GDay[]).sort((a, b) => a.day_number - b.day_number)
    },
    enabled: !!trip,
  })

  const todayStr = new Date().toISOString().split('T')[0]

  if (tripLoading || daysLoading) {
    return (
      <div className="p-4 pt-6 flex justify-center py-20">
        <p className="text-forest/40 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="p-4 pt-6 pb-10">
      <h1 className="font-display text-2xl text-forest mb-1">Route</h1>
      <p className="text-sm text-forest/50 mb-5">Each day's drive at a glance.</p>

      {days.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-forest/50 text-sm">No route added yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {days.map((day) => {
            const isToday = !!day.date && day.date === todayStr
            const hasRoute = day.start_location || day.end_location
            const mapsUrl = (day.start_location && day.end_location)
              ? `https://www.google.com/maps/dir/${encodeURIComponent(day.start_location)}/${encodeURIComponent(day.end_location)}`
              : null

            return (
              <div key={day.id} className="card">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-deep-teal bg-deep-teal/10 rounded px-1.5 py-0.5">
                      Day {day.day_number}
                    </span>
                    {isToday && (
                      <span className="text-xs font-medium text-white bg-deep-teal rounded-full px-2 py-0.5">
                        Today
                      </span>
                    )}
                    {day.date && (
                      <span className="text-xs text-forest/50">{fmtDate(day.date)}</span>
                    )}
                  </div>
                  {mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-sage underline shrink-0"
                    >
                      Maps ↗
                    </a>
                  )}
                </div>

                {/* Route */}
                {hasRoute ? (
                  <div className="space-y-1 mb-2">
                    {day.start_location && (
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-sage shrink-0" />
                        <p className="text-sm text-forest">{day.start_location}</p>
                      </div>
                    )}
                    {day.start_location && day.end_location && (
                      <div className="pl-[4px]">
                        <div className="w-px h-4 bg-forest/20 ml-[1px]" />
                      </div>
                    )}
                    {day.end_location && (
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-terracotta/70 shrink-0" />
                        <p className="text-sm text-forest">{day.end_location}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-forest/30 italic mb-2">Route not set yet</p>
                )}

                {/* Drive stats */}
                {(day.departure_time || day.drive_hours || day.drive_miles) && (
                  <p className="text-xs text-forest/50">
                    {day.departure_time ? `Depart ${fmtTime(day.departure_time)}` : ''}
                    {day.departure_time && (day.drive_hours || day.drive_miles) ? ' · ' : ''}
                    {day.drive_hours ? `${day.drive_hours} hrs` : ''}
                    {day.drive_hours && day.drive_miles ? ' · ' : ''}
                    {day.drive_miles ? `${day.drive_miles} mi` : ''}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
