import { useState, useEffect } from 'react'
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useTrip } from '@/hooks/useTrip'
import type { Budget } from '@/types'

export default function SettingsPage() {
  const { user, tripId, setTripId, signOut } = useAppStore()
  const queryClient = useQueryClient()
  const { data: trip, isLoading: tripLoading } = useTrip()

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

  // Trip fields
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [shareEnabled, setShareEnabled] = useState(false)

  // Budget fields
  const [foodTotal, setFoodTotal] = useState('')
  const [foodDays, setFoodDays] = useState('')
  const [hotelTotal, setHotelTotal] = useState('')
  const [hotelBuffer, setHotelBuffer] = useState('500')
  const [carBudget, setCarBudget] = useState('')

  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!trip) return
    setName(trip.name ?? '')
    setStartDate(trip.start_date ?? '')
    setEndDate(trip.end_date ?? '')
    setShareEnabled(trip.share_enabled)
  }, [trip])

  useEffect(() => {
    if (!budget) return
    setFoodTotal(String(budget.food_total ?? ''))
    setFoodDays(String(budget.food_days ?? ''))
    setHotelTotal(String(budget.hotel_total ?? ''))
    setHotelBuffer(String(budget.hotel_buffer ?? 500))
    setCarBudget(String(budget.car_total_budget ?? ''))
  }, [budget])

  const numDays =
    startDate && endDate
      ? Math.max(
          1,
          Math.round(
            (new Date(endDate).getTime() - new Date(startDate).getTime()) /
              (1000 * 60 * 60 * 24)
          ) + 1
        )
      : null

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in')
      let currentTripId = trip?.id ?? tripId

      if (trip) {
        const { error } = await supabase
          .from('trips')
          .update({
            name,
            start_date: startDate || null,
            end_date: endDate || null,
            num_days: numDays,
            share_enabled: shareEnabled,
          })
          .eq('id', trip.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('trips')
          .insert({
            owner_uid: user.id,
            name: name || 'My Trip',
            start_date: startDate || null,
            end_date: endDate || null,
            num_days: numDays,
            share_enabled: shareEnabled,
          })
          .select()
          .single()
        if (error) throw error
        setTripId(data.id)
        currentTripId = data.id
      }

      if (currentTripId) {
        const { error } = await supabase.from('budget').upsert(
          {
            trip_id: currentTripId,
            food_total: parseFloat(foodTotal) || 0,
            food_days: parseInt(foodDays) || 0,
            hotel_total: parseFloat(hotelTotal) || 0,
            hotel_buffer: parseFloat(hotelBuffer) || 500,
            car_total_budget: parseFloat(carBudget) || 0,
          },
          { onConflict: 'trip_id' }
        )
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip'] })
      queryClient.invalidateQueries({ queryKey: ['budget'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const guestLink = trip
    ? `${window.location.origin}/trip/${trip.share_code}`
    : ''

  function copyLink() {
    navigator.clipboard.writeText(guestLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (tripLoading) {
    return (
      <div className="p-4 pt-6 flex justify-center py-20">
        <p className="text-forest/40 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="p-4 pt-6 pb-10">
      <h1 className="font-display text-2xl text-forest mb-1">Settings</h1>
      {!trip && (
        <p className="text-sm text-gold font-medium mb-4">
          Set up your trip to get started.
        </p>
      )}

      <div className="space-y-4 mt-4">

        {/* ── Trip Setup ── */}
        <div className="card">
          <p className="section-label">Trip Setup</p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-forest mb-1">Trip name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Southwest National Parks 2026"
                className="input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-forest mb-1">Start date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm text-forest mb-1">End date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input"
                />
              </div>
            </div>
            {numDays && (
              <p className="text-xs text-forest/50">
                {numDays} day{numDays !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        {/* ── Budget ── */}
        <div className="card">
          <p className="section-label">Budget</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-forest mb-1">Food total ($)</label>
                <input
                  type="number"
                  value={foodTotal}
                  onChange={(e) => setFoodTotal(e.target.value)}
                  placeholder="2500"
                  min="0"
                  className="input font-mono"
                />
              </div>
              <div>
                <label className="block text-sm text-forest mb-1">Food days</label>
                <input
                  type="number"
                  value={foodDays}
                  onChange={(e) => setFoodDays(e.target.value)}
                  placeholder="14"
                  min="0"
                  className="input font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-forest mb-1">Hotel total ($)</label>
                <input
                  type="number"
                  value={hotelTotal}
                  onChange={(e) => setHotelTotal(e.target.value)}
                  placeholder="3200"
                  min="0"
                  className="input font-mono"
                />
              </div>
              <div>
                <label className="block text-sm text-forest mb-1">Hotel buffer ($)</label>
                <input
                  type="number"
                  value={hotelBuffer}
                  onChange={(e) => setHotelBuffer(e.target.value)}
                  placeholder="500"
                  min="0"
                  className="input font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-forest mb-1">Car budget ceiling ($)</label>
              <input
                type="number"
                value={carBudget}
                onChange={(e) => setCarBudget(e.target.value)}
                placeholder="800"
                min="0"
                className="input font-mono"
              />
            </div>
          </div>
        </div>

        {/* ── Guest Sharing ── */}
        <div className="card">
          <p className="section-label">Guest Sharing</p>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-forest">Share link enabled</span>
            <button
              role="switch"
              aria-checked={shareEnabled}
              onClick={() => setShareEnabled((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                shareEnabled ? 'bg-sage' : 'bg-forest/20'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  shareEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          {trip ? (
            <div className="space-y-2">
              <p className="text-xs text-forest/50 break-all font-mono">{guestLink}</p>
              <button onClick={copyLink} className="btn-secondary w-full text-sm">
                {copied ? '✓ Copied!' : 'Copy guest link'}
              </button>
            </div>
          ) : (
            <p className="text-xs text-forest/40">Save your trip first to get a share link.</p>
          )}
        </div>

        {/* ── Save / Error ── */}
        {saveMutation.isError && (
          <p className="text-sm text-terracotta bg-terracotta/10 rounded-lg px-3 py-2">
            {(saveMutation.error as Error).message}
          </p>
        )}

        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !name.trim()}
          className="btn-primary w-full"
        >
          {saveMutation.isPending
            ? 'Saving…'
            : saved
            ? '✓ Saved'
            : trip
            ? 'Save Changes'
            : 'Create Trip'}
        </button>

        <button onClick={signOut} className="btn-secondary w-full">
          Sign out
        </button>
      </div>
    </div>
  )
}
