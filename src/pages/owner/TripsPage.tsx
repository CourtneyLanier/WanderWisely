import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import type { Trip } from '@/types'

// ── helpers ───────────────────────────────────────────────────────────────────

function tripStatus(trip: Trip): { label: string; color: string } {
  if (!trip.start_date) return { label: 'Draft', color: 'text-forest/40' }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = new Date(trip.start_date + 'T00:00:00')
  const end = trip.end_date ? new Date(trip.end_date + 'T00:00:00') : null
  if (today < start) return { label: 'Upcoming', color: 'text-deep-teal' }
  if (!end || today <= end) return { label: 'In progress', color: 'text-sage' }
  return { label: 'Complete', color: 'text-forest/40' }
}

function fmtDateRange(trip: Trip) {
  if (!trip.start_date && !trip.end_date) return null
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = trip.start_date
    ? new Date(trip.start_date + 'T00:00:00').toLocaleDateString('en-US', opts)
    : '?'
  const e = trip.end_date
    ? new Date(trip.end_date + 'T00:00:00').toLocaleDateString('en-US', opts)
    : '?'
  return `${s} – ${e}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TripsPage() {
  const { user, tripId, setTripId } = useAppStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ['all-trips', user?.id],
    queryFn: async (): Promise<Trip[]> => {
      const { data, error } = await supabase
        .from('trips').select('*')
        .eq('owner_uid', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!user,
  })

  const createMutation = useMutation({
    mutationFn: async (): Promise<Trip> => {
      const { data, error } = await supabase
        .from('trips')
        .insert({
          owner_uid: user!.id,
          name: newName.trim() || 'New Trip',
          share_enabled: false,
        })
        .select()
        .single()
      if (error) throw error
      return data as Trip
    },
    onSuccess: (trip) => {
      queryClient.invalidateQueries({ queryKey: ['all-trips'] })
      setTripId(trip.id)
      navigate('/settings', { replace: true })
    },
  })

  function selectTrip(trip: Trip) {
    setTripId(trip.id)
    queryClient.invalidateQueries({ queryKey: ['trip'] })
    navigate('/overview', { replace: true })
  }

  function cancelCreate() {
    setCreating(false)
    setNewName('')
  }

  return (
    <div className="p-4 pt-6 pb-10">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl text-forest leading-tight">My Trips</h1>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="btn-primary text-sm px-3 py-1.5"
          >
            + New trip
          </button>
        )}
      </div>

      {/* Create new trip form */}
      {creating && (
        <div className="card mb-4 space-y-3">
          <p className="font-display text-lg text-forest">New Trip</p>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Southwest Road Trip 2026"
            className="input"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && !createMutation.isPending) createMutation.mutate() }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="btn-primary flex-1"
            >
              {createMutation.isPending ? 'Creating…' : 'Create & set up'}
            </button>
            <button onClick={cancelCreate} className="btn-secondary px-4">
              Cancel
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-xs text-terracotta">{(createMutation.error as Error).message}</p>
          )}
        </div>
      )}

      {isLoading && (
        <p className="text-forest/40 text-sm text-center py-20">Loading…</p>
      )}

      {!isLoading && trips.length === 0 && !creating && (
        <div className="card text-center py-14 space-y-3">
          <p className="text-3xl">🗺️</p>
          <p className="font-medium text-forest">No trips yet</p>
          <p className="text-sm text-forest/50">Create your first trip to get started.</p>
          <button onClick={() => setCreating(true)} className="btn-primary mt-2">
            + New trip
          </button>
        </div>
      )}

      {trips.length > 0 && (
        <div className="space-y-3">
          {trips.map((trip) => {
            const isActive = trip.id === tripId
            const status = tripStatus(trip)
            const dateRange = fmtDateRange(trip)
            return (
              <button
                key={trip.id}
                onClick={() => selectTrip(trip)}
                className={`card w-full text-left transition-colors ${
                  isActive
                    ? 'border-sage/50 bg-sage/5'
                    : 'hover:border-forest/20 hover:bg-cream/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-forest">{trip.name}</p>
                      {isActive && (
                        <span className="text-xs text-sage bg-sage/10 rounded px-1.5 py-0.5 shrink-0">
                          Active
                        </span>
                      )}
                    </div>
                    {dateRange && (
                      <p className="text-xs text-forest/50 mt-0.5">{dateRange}</p>
                    )}
                    {trip.num_days && (
                      <p className="text-xs text-forest/40 mt-0.5">{trip.num_days} days</p>
                    )}
                  </div>
                  <span className={`text-xs font-medium shrink-0 mt-0.5 ${status.color}`}>
                    {status.label}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
