import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useTrip } from '@/hooks/useTrip'
import type { Budget, SpendingLog } from '@/types'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null
  const diff = Math.ceil(
    (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  return diff
}

export default function OverviewPage() {
  const tripId = useAppStore((s) => s.tripId)
  const { data: trip, isLoading } = useTrip()

  const { data: budget } = useQuery({
    queryKey: ['budget', tripId],
    queryFn: async (): Promise<Budget | null> => {
      const { data, error } = await supabase
        .from('budget')
        .select('*')
        .eq('trip_id', tripId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!tripId,
  })

  const { data: spending = [] } = useQuery({
    queryKey: ['spending', tripId],
    queryFn: async (): Promise<SpendingLog[]> => {
      const { data, error } = await supabase
        .from('spending_log')
        .select('*')
        .eq('trip_id', tripId!)
      if (error) throw error
      return data ?? []
    },
    enabled: !!tripId,
  })

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
        <h1 className="font-display text-2xl text-forest mb-6">Welcome to WanderWisely</h1>
        <div className="card text-center py-10 space-y-3">
          <p className="text-forest/60 text-sm">No trip yet.</p>
          <Link to="/settings" className="btn-primary inline-block">
            Create your trip →
          </Link>
        </div>
      </div>
    )
  }

  // Countdown
  const countdown = daysUntil(trip.start_date)
  const countdownLabel =
    countdown === null
      ? 'Dates TBD'
      : countdown > 0
      ? `${countdown} day${countdown !== 1 ? 's' : ''} to go`
      : countdown === 0
      ? 'Trip starts today!'
      : 'Trip in progress'

  // Date range display
  const dateRange =
    trip.start_date && trip.end_date
      ? `${new Date(trip.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(trip.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : 'Dates TBD'

  // Budget health
  const foodSpent = spending
    .filter((s) => s.card === 'food')
    .reduce((sum, s) => sum + s.amount, 0)
  const carSpent = spending
    .filter((s) => s.card === 'car')
    .reduce((sum, s) => sum + s.amount, 0)

  const foodDaysLogged = new Set(
    spending.filter((s) => s.card === 'food' && s.day_id).map((s) => s.day_id)
  ).size

  const dailyBaseline = budget && budget.food_days > 0
    ? budget.food_total / budget.food_days
    : 0

  const foodCushion = dailyBaseline > 0
    ? foodDaysLogged * dailyBaseline - foodSpent
    : null

  const hotelOk = budget ? budget.hotel_total > 0 : false
  const carRemaining = budget ? budget.car_total_budget - carSpent : null

  return (
    <div className="p-4 pt-6">
      {/* Trip header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl text-forest leading-snug">{trip.name}</h1>
        <p className="text-sm text-forest/60 mt-0.5">{dateRange}</p>
        {trip.num_days && (
          <p className="text-xs text-forest/40 mt-0.5">{trip.num_days} days</p>
        )}
      </div>

      <div className="space-y-4">
        {/* Countdown */}
        <div className="card flex items-center justify-between">
          <div>
            <p className="section-label mb-0">Departure</p>
            <p className="font-display text-xl text-forest mt-0.5">{countdownLabel}</p>
          </div>
          <span className="text-3xl">🗺️</span>
        </div>

        {/* Budget health */}
        {budget && (
          <div className="card">
            <p className="section-label">Budget Health</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              {/* Food */}
              <div>
                <p className="text-xs text-forest/50 mb-1">Food cushion</p>
                {foodCushion !== null ? (
                  <p
                    className={`font-mono text-base font-medium ${
                      foodCushion >= 0 ? 'text-sage' : 'text-terracotta'
                    }`}
                  >
                    {foodCushion >= 0 ? '+' : ''}
                    {fmt(foodCushion)}
                  </p>
                ) : (
                  <p className="font-mono text-base text-forest/30">—</p>
                )}
              </div>
              {/* Hotel */}
              <div>
                <p className="text-xs text-forest/50 mb-1">Hotel</p>
                <p className={`text-sm font-medium ${hotelOk ? 'text-sage' : 'text-forest/30'}`}>
                  {hotelOk ? '✓ Set' : '—'}
                </p>
              </div>
              {/* Car */}
              <div>
                <p className="text-xs text-forest/50 mb-1">Car left</p>
                {carRemaining !== null && budget.car_total_budget > 0 ? (
                  <p
                    className={`font-mono text-base font-medium ${
                      carRemaining >= 0 ? 'text-forest' : 'text-terracotta'
                    }`}
                  >
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
        <div className="grid grid-cols-2 gap-3">
          <Link to="/days" className="card flex flex-col items-center py-5 gap-2 hover:bg-cream transition-colors">
            <span className="text-2xl">📅</span>
            <span className="text-sm font-medium text-forest">View days</span>
          </Link>
          <Link to="/wallet" className="card flex flex-col items-center py-5 gap-2 hover:bg-cream transition-colors">
            <span className="text-2xl">🎫</span>
            <span className="text-sm font-medium text-forest">Wallet</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
