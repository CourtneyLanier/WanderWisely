import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import type { Day, Lodging, Activity, LodgingType, ActivityType, MealSlot, Reservation } from '@/types'

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
}

// ─── Day header edit form ─────────────────────────────────────────────────────

function DayHeader({ day }: { day: Day }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [startLoc, setStartLoc] = useState(day.start_location ?? '')
  const [endLoc, setEndLoc] = useState(day.end_location ?? '')
  const [miles, setMiles] = useState(String(day.drive_miles ?? ''))
  const [hours, setHours] = useState(String(day.drive_hours ?? ''))
  const [notes, setNotes] = useState(day.notes ?? '')
  const [date, setDate] = useState(day.date ?? '')
  const [departureTime, setDepartureTime] = useState(day.departure_time ?? '')

  useEffect(() => {
    setStartLoc(day.start_location ?? '')
    setEndLoc(day.end_location ?? '')
    setMiles(String(day.drive_miles ?? ''))
    setHours(String(day.drive_hours ?? ''))
    setNotes(day.notes ?? '')
    setDate(day.date ?? '')
    setDepartureTime(day.departure_time ?? '')
  }, [day])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('days')
        .update({
          date: date || null,
          departure_time: departureTime || null,
          start_location: startLoc || null,
          end_location: endLoc || null,
          drive_miles: miles ? parseInt(miles) : null,
          drive_hours: hours ? parseFloat(hours) : null,
          notes: notes || null,
        })
        .eq('id', day.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['day', day.id] })
      queryClient.invalidateQueries({ queryKey: ['days'] })
      setEditing(false)
    },
  })

  return (
    <div className="card mb-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="text-xs font-medium text-deep-teal bg-deep-teal/10 rounded px-1.5 py-0.5">
            Day {day.day_number}
          </span>
          <p className="text-sm text-forest/60 mt-1">{fmt(day.date) || 'Date not set'}</p>
          {!editing && (day.start_location || day.end_location) && (
            <p className="text-base font-medium text-forest mt-0.5">
              {day.start_location || '?'} → {day.end_location || '?'}
            </p>
          )}
          {!editing && (day.drive_miles || day.drive_hours || day.departure_time) && (
            <p className="text-xs text-forest/50 mt-0.5">
              {day.departure_time ? `Leave ${day.departure_time.slice(0, 5)}` : ''}
              {day.departure_time && (day.drive_miles || day.drive_hours) ? ' · ' : ''}
              {day.drive_miles ? `${day.drive_miles} mi` : ''}
              {day.drive_miles && day.drive_hours ? ' · ' : ''}
              {day.drive_hours ? `${day.drive_hours} hrs drive` : ''}
            </p>
          )}
          {!editing && day.notes && (
            <p className="text-xs text-forest/60 mt-1 italic">{day.notes}</p>
          )}
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-xs text-sage hover:text-forest transition-colors ml-2"
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {editing && (
        <div className="space-y-3 pt-2 border-t border-forest/10">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-forest mb-1">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-sm text-forest mb-1">Leave by</label>
              <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-forest mb-1">From</label>
              <input type="text" value={startLoc} onChange={(e) => setStartLoc(e.target.value)}
                placeholder="Starting city" className="input" />
            </div>
            <div>
              <label className="block text-sm text-forest mb-1">To</label>
              <input type="text" value={endLoc} onChange={(e) => setEndLoc(e.target.value)}
                placeholder="Ending city" className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-forest mb-1">Miles</label>
              <input type="number" value={miles} onChange={(e) => setMiles(e.target.value)}
                placeholder="0" min="0" className="input font-mono" />
            </div>
            <div>
              <label className="block text-sm text-forest mb-1">Drive hours</label>
              <input type="number" value={hours} onChange={(e) => setHours(e.target.value)}
                placeholder="0.0" min="0" step="0.25" className="input font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-forest mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Day notes…" rows={2}
              className="input resize-none" />
          </div>
          {saveMutation.isError && (
            <p className="text-xs text-terracotta">{(saveMutation.error as Error).message}</p>
          )}
          <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
            className="btn-primary w-full">
            {saveMutation.isPending ? 'Saving…' : 'Save Day'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Lodging section ──────────────────────────────────────────────────────────

const EMPTY_LODGING = {
  name: '', type: 'hotel' as LodgingType, address: '', listing_url: '',
  confirmation_number: '', check_in_time: '', check_out_time: '',
  bedrooms: '', bathrooms: '', beds: '', room_type: '',
  nightly_rate: '', total_cost: '', notes: '',
}

function LodgingSection({ dayId, tripId, date }: { dayId: string; tripId?: string | null; date?: string | null }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState(EMPTY_LODGING)

  const { data: lodging } = useQuery({
    queryKey: ['lodging', dayId],
    queryFn: async (): Promise<Lodging | null> => {
      const { data, error } = await supabase
        .from('lodging').select('*').eq('day_id', dayId).maybeSingle()
      if (error) throw error
      return data
    },
  })

  const { data: hotelReservations = [] } = useQuery({
    queryKey: ['hotel-reservations-for-day', tripId, date],
    queryFn: async (): Promise<Reservation[]> => {
      if (!tripId || !date) return []
      const { data, error } = await supabase
        .from('reservations').select('*')
        .eq('trip_id', tripId).eq('date', date).eq('type', 'hotel')
        .order('time', { nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!tripId && !!date,
  })

  useEffect(() => {
    if (!lodging) return
    setF({
      name: lodging.name ?? '',
      type: (lodging.type as LodgingType) ?? 'hotel',
      address: lodging.address ?? '',
      listing_url: lodging.listing_url ?? '',
      confirmation_number: lodging.confirmation_number ?? '',
      check_in_time: lodging.check_in_time ?? '',
      check_out_time: lodging.check_out_time ?? '',
      bedrooms: String(lodging.bedrooms ?? ''),
      bathrooms: String(lodging.bathrooms ?? ''),
      beds: String(lodging.beds ?? ''),
      room_type: lodging.room_type ?? '',
      nightly_rate: String(lodging.nightly_rate ?? ''),
      total_cost: String(lodging.total_cost ?? ''),
      notes: lodging.notes ?? '',
    })
  }, [lodging])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        day_id: dayId,
        name: f.name || null,
        type: f.type || null,
        address: f.address || null,
        listing_url: f.listing_url || null,
        confirmation_number: f.confirmation_number || null,
        check_in_time: f.check_in_time || null,
        check_out_time: f.check_out_time || null,
        bedrooms: f.bedrooms ? parseInt(f.bedrooms) : null,
        bathrooms: f.bathrooms ? parseFloat(f.bathrooms) : null,
        beds: f.beds ? parseInt(f.beds) : null,
        room_type: f.room_type || null,
        nightly_rate: f.nightly_rate ? parseFloat(f.nightly_rate) : null,
        total_cost: f.total_cost ? parseFloat(f.total_cost) : null,
        notes: f.notes || null,
      }
      if (lodging) {
        const { error } = await supabase.from('lodging').update(payload).eq('id', lodging.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('lodging').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lodging', dayId] })
      setEditing(false)
    },
  })

  const field = (key: keyof typeof f) => (
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF((prev) => ({ ...prev, [key]: e.target.value }))
  )

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="section-label mb-0">Lodging</p>
        {!editing && (
          <button onClick={() => setEditing(true)}
            className="text-xs text-sage hover:text-forest transition-colors">
            {lodging ? 'Edit' : '+ Add'}
          </button>
        )}
      </div>

      {!editing && lodging && (
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-forest">{lodging.name}</p>
              <p className="text-xs text-forest/50 mt-0.5">
                {lodging.type}{lodging.room_type ? ` · ${lodging.room_type}` : ''}
              </p>
              {(lodging.check_in_time || lodging.check_out_time) && (
                <p className="text-xs text-forest/60 mt-1">
                  In {lodging.check_in_time ?? '—'} · Out {lodging.check_out_time ?? '—'}
                </p>
              )}
              {lodging.confirmation_number && (
                <p className="text-xs text-forest/50 mt-0.5 font-mono">
                  #{lodging.confirmation_number}
                </p>
              )}
              {lodging.nightly_rate && (
                <p className="text-xs text-gold mt-1 font-mono">
                  ${lodging.nightly_rate}/night
                  {lodging.total_cost ? ` · $${lodging.total_cost} total` : ''}
                </p>
              )}
            </div>
            {lodging.listing_url && (
              <a href={lodging.listing_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-sage underline ml-3">View</a>
            )}
          </div>
        </div>
      )}

      {!editing && !lodging && hotelReservations.length === 0 && (
        <div className="card text-center py-6">
          <p className="text-forest/40 text-sm">No lodging added yet.</p>
        </div>
      )}

      {!editing && hotelReservations.length > 0 && (
        <div className="space-y-2 mt-2">
          {hotelReservations.map((r) => (
            <div key={r.id} className="card border-l-2 border-l-deep-teal/30">
              <div className="flex items-start gap-2">
                <span className="text-base shrink-0">🏨</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-forest truncate">
                    {r.title || r.provider || 'Hotel Reservation'}
                  </p>
                  {r.provider && r.title && (
                    <p className="text-xs text-forest/50 truncate">{r.provider}</p>
                  )}
                  {r.confirmation_number && (
                    <p className="text-xs font-mono text-forest/40 mt-0.5">#{r.confirmation_number}</p>
                  )}
                  {r.address && (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(r.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-deep-teal underline mt-0.5 block truncate"
                    >
                      {r.address}
                    </a>
                  )}
                  {r.cost != null && (
                    <p className="text-xs font-mono text-gold mt-0.5">
                      ${r.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                  {r.pdf_url && (
                    <a href={r.pdf_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-deep-teal underline mt-1 block">
                      📄 View PDF
                    </a>
                  )}
                </div>
              </div>
              <p className="text-xs text-forest/30 mt-1.5 ml-6">From Wallet</p>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="card space-y-3">
          <div>
            <label className="block text-sm text-forest mb-1">Name</label>
            <input type="text" value={f.name} onChange={field('name')}
              placeholder="Hotel / Airbnb name" className="input" />
          </div>
          <div>
            <label className="block text-sm text-forest mb-1">Type</label>
            <select value={f.type} onChange={field('type')} className="input">
              <option value="hotel">Hotel</option>
              <option value="airbnb">Airbnb</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-forest mb-1">Room type</label>
            <input type="text" value={f.room_type} onChange={field('room_type')}
              placeholder="King Suite, 2BR cabin…" className="input" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-forest mb-1">Beds</label>
              <input type="number" value={f.beds} onChange={field('beds')}
                min="0" className="input font-mono" />
            </div>
            <div>
              <label className="block text-sm text-forest mb-1">Bedrooms</label>
              <input type="number" value={f.bedrooms} onChange={field('bedrooms')}
                min="0" className="input font-mono" />
            </div>
            <div>
              <label className="block text-sm text-forest mb-1">Baths</label>
              <input type="number" value={f.bathrooms} onChange={field('bathrooms')}
                min="0" step="0.5" className="input font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-forest mb-1">Check-in</label>
              <input type="time" value={f.check_in_time} onChange={field('check_in_time')}
                className="input" />
            </div>
            <div>
              <label className="block text-sm text-forest mb-1">Check-out</label>
              <input type="time" value={f.check_out_time} onChange={field('check_out_time')}
                className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-forest mb-1">Nightly rate ($)</label>
              <input type="number" value={f.nightly_rate} onChange={field('nightly_rate')}
                min="0" placeholder="0" className="input font-mono" />
            </div>
            <div>
              <label className="block text-sm text-forest mb-1">Total cost ($)</label>
              <input type="number" value={f.total_cost} onChange={field('total_cost')}
                min="0" placeholder="0" className="input font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-forest mb-1">Confirmation #</label>
            <input type="text" value={f.confirmation_number}
              onChange={field('confirmation_number')}
              placeholder="ABC123" className="input font-mono" />
          </div>
          <div>
            <label className="block text-sm text-forest mb-1">Listing URL</label>
            <input type="url" value={f.listing_url} onChange={field('listing_url')}
              placeholder="https://…" className="input" />
          </div>
          <div>
            <label className="block text-sm text-forest mb-1">Address</label>
            <input type="text" value={f.address} onChange={field('address')}
              placeholder="123 Main St, City, ST" className="input" />
          </div>
          <div>
            <label className="block text-sm text-forest mb-1">Notes</label>
            <textarea value={f.notes} onChange={field('notes')}
              placeholder="Parking info, access codes…" rows={2}
              className="input resize-none" />
          </div>
          {saveMutation.isError && (
            <p className="text-xs text-terracotta">{(saveMutation.error as Error).message}</p>
          )}
          <div className="flex gap-2">
            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
              className="btn-primary flex-1">
              {saveMutation.isPending ? 'Saving…' : 'Save Lodging'}
            </button>
            <button onClick={() => setEditing(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Activity card ────────────────────────────────────────────────────────────

function ActivityCard({
  activity,
  onEdit,
  onDelete,
}: {
  activity: Activity
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-forest/5 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-forest truncate">{activity.name}</p>
          {activity.is_booked && (
            <span className="text-xs text-sage font-medium">✓ Booked</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 mt-0.5">
          {activity.time && (
            <span className="text-xs text-forest/50">{activity.time.slice(0, 5)}</span>
          )}
          {activity.address && (
            <span className="text-xs text-forest/50 truncate">{activity.address}</span>
          )}
          {activity.estimated_cost != null && (
            <span className="text-xs text-gold font-mono">${activity.estimated_cost}</span>
          )}
        </div>
        {activity.confirmation_number && (
          <p className="text-xs text-forest/40 font-mono mt-0.5">
            #{activity.confirmation_number}
          </p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={onEdit} className="text-xs text-sage hover:text-forest transition-colors">
          Edit
        </button>
        <button onClick={onDelete} className="text-xs text-terracotta hover:text-forest transition-colors">
          ✕
        </button>
      </div>
    </div>
  )
}

// ─── Activity form ────────────────────────────────────────────────────────────

const EMPTY_ACTIVITY = {
  name: '', type: 'main' as ActivityType, meal_slot: null as MealSlot | null,
  time: '', address: '', confirmation_number: '', url: '',
  estimated_cost: '', notes: '', is_booked: false,
}

function ActivityForm({
  dayId,
  initial,
  initialType,
  initialSlot,
  onDone,
}: {
  dayId: string
  initial?: Activity
  initialType?: ActivityType
  initialSlot?: MealSlot | null
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [f, setF] = useState<typeof EMPTY_ACTIVITY>(() =>
    initial
      ? {
          name: initial.name ?? '',
          type: (initial.type as ActivityType) ?? 'main',
          meal_slot: initial.meal_slot as MealSlot | null,
          time: initial.time ?? '',
          address: initial.address ?? '',
          confirmation_number: initial.confirmation_number ?? '',
          url: initial.url ?? '',
          estimated_cost: String(initial.estimated_cost ?? ''),
          notes: initial.notes ?? '',
          is_booked: initial.is_booked,
        }
      : { ...EMPTY_ACTIVITY, type: initialType ?? 'main', meal_slot: initialSlot ?? null }
  )

  const set = (key: keyof typeof EMPTY_ACTIVITY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF((prev) => ({ ...prev, [key]: e.target.value }))

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        day_id: dayId,
        name: f.name || null,
        type: f.type,
        meal_slot: f.type === 'meal' ? f.meal_slot : null,
        time: f.time || null,
        address: f.address || null,
        confirmation_number: f.confirmation_number || null,
        url: f.url || null,
        estimated_cost: f.estimated_cost ? parseFloat(f.estimated_cost) : null,
        notes: f.notes || null,
        is_booked: f.is_booked,
      }
      if (initial) {
        const { error } = await supabase.from('activities').update(payload).eq('id', initial.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('activities').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities', dayId] })
      onDone()
    },
  })

  return (
    <div className="card space-y-3 mt-3">
      <div>
        <label className="block text-sm text-forest mb-1">Name</label>
        <input type="text" value={f.name} onChange={set('name')}
          placeholder="Activity or restaurant name" className="input" autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-forest mb-1">Type</label>
          <select value={f.type}
            onChange={(e) => setF((prev) => ({ ...prev, type: e.target.value as ActivityType, meal_slot: null }))}
            className="input">
            <option value="main">Main plan</option>
            <option value="side_quest">Side quest</option>
            <option value="meal">Meal</option>
            <option value="reservation">Reservation</option>
          </select>
        </div>
        {f.type === 'meal' && (
          <div>
            <label className="block text-sm text-forest mb-1">Meal slot</label>
            <select value={f.meal_slot ?? ''}
              onChange={(e) => setF((prev) => ({ ...prev, meal_slot: (e.target.value as MealSlot) || null }))}
              className="input">
              <option value="">— select —</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-forest mb-1">Time</label>
          <input type="time" value={f.time} onChange={set('time')} className="input" />
        </div>
        <div>
          <label className="block text-sm text-forest mb-1">Est. cost ($)</label>
          <input type="number" value={f.estimated_cost} onChange={set('estimated_cost')}
            min="0" placeholder="0" className="input font-mono" />
        </div>
      </div>
      <div>
        <label className="block text-sm text-forest mb-1">Address</label>
        <input type="text" value={f.address} onChange={set('address')}
          placeholder="123 Main St, City" className="input" />
      </div>
      <div>
        <label className="block text-sm text-forest mb-1">Confirmation #</label>
        <input type="text" value={f.confirmation_number} onChange={set('confirmation_number')}
          placeholder="ABC123" className="input font-mono" />
      </div>
      <div>
        <label className="block text-sm text-forest mb-1">URL / Link</label>
        <input type="url" value={f.url} onChange={set('url')}
          placeholder="https://…" className="input" />
      </div>
      <div>
        <label className="block text-sm text-forest mb-1">Notes</label>
        <textarea value={f.notes} onChange={set('notes')}
          placeholder="Any notes…" rows={2} className="input resize-none" />
      </div>
      <label className="flex items-center gap-2 text-sm text-forest">
        <input type="checkbox" checked={f.is_booked}
          onChange={(e) => setF((prev) => ({ ...prev, is_booked: e.target.checked }))}
          className="accent-sage w-4 h-4" />
        Booked / confirmed
      </label>
      {saveMutation.isError && (
        <p className="text-xs text-terracotta">{(saveMutation.error as Error).message}</p>
      )}
      <div className="flex gap-2">
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !f.name.trim()}
          className="btn-primary flex-1">
          {saveMutation.isPending ? 'Saving…' : initial ? 'Update' : 'Add'}
        </button>
        <button onClick={onDone} className="btn-secondary">Cancel</button>
      </div>
    </div>
  )
}

// ─── Activities section ───────────────────────────────────────────────────────

const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']
const MEAL_ICONS: Record<MealSlot, string> = {
  breakfast: '🍳', lunch: '🥗', dinner: '🍽️', snack: '🍎',
}

function ActivitiesSection({ dayId }: { dayId: string }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [addingSlot, setAddingSlot] = useState<MealSlot | null>(null)
  const [editing, setEditing] = useState<Activity | undefined>(undefined)

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', dayId],
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase
        .from('activities').select('*').eq('day_id', dayId)
        .order('sort_order').order('time', { nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('activities').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities', dayId] }),
  })

  const meals = activities.filter((a) => a.type === 'meal')
  const plans = activities.filter((a) => a.type !== 'meal')

  return (
    <div>
      {/* ── Meals ── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="section-label mb-0">Meals</p>
        </div>
        <div className="card divide-y divide-forest/5">
          {MEAL_SLOTS.filter((s) => s !== 'snack').map((slot) => {
            const meal = meals.find((a) => a.meal_slot === slot)
            return (
              <div key={slot} className="py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{MEAL_ICONS[slot]}</span>
                    <span className="text-sm font-medium text-forest capitalize">{slot}</span>
                  </div>
                  {!meal && (
                    <button
                      onClick={() => {
                        setAddingSlot(slot)
                        setAdding(false)
                        setEditing(undefined)
                      }}
                      className="text-xs text-sage hover:text-forest transition-colors"
                    >
                      + Add
                    </button>
                  )}
                </div>
                {meal && !editing && (
                  <div className="mt-1 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-forest">{meal.name}</p>
                      <div className="flex gap-2 mt-0.5">
                        {meal.time && <span className="text-xs text-forest/50">{meal.time.slice(0, 5)}</span>}
                        {meal.estimated_cost != null && (
                          <span className="text-xs text-gold font-mono">${meal.estimated_cost}</span>
                        )}
                        {meal.is_booked && <span className="text-xs text-sage">✓ Booked</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditing(meal); setAdding(false); setAddingSlot(null) }}
                        className="text-xs text-sage hover:text-forest transition-colors">Edit</button>
                      <button onClick={() => deleteMutation.mutate(meal.id)}
                        className="text-xs text-terracotta hover:text-forest transition-colors">✕</button>
                    </div>
                  </div>
                )}
                {editing?.id === meal?.id && (
                  <ActivityForm dayId={dayId} initial={editing}
                    onDone={() => setEditing(undefined)} />
                )}
                {addingSlot === slot && (
                  <ActivityForm
                    dayId={dayId}
                    initialType="meal"
                    initialSlot={slot}
                    onDone={() => setAddingSlot(null)}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Plans & side quests ── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="section-label mb-0">Activities</p>
          <button
            onClick={() => { setAdding(true); setEditing(undefined); setAddingSlot(null) }}
            className="text-xs text-sage hover:text-forest transition-colors"
          >
            + Add
          </button>
        </div>

        {plans.length > 0 && (
          <div className="card">
            {plans.map((a) =>
              editing?.id === a.id ? (
                <ActivityForm key={a.id} dayId={dayId} initial={editing}
                  onDone={() => setEditing(undefined)} />
              ) : (
                <ActivityCard key={a.id} activity={a}
                  onEdit={() => { setEditing(a); setAdding(false); setAddingSlot(null) }}
                  onDelete={() => deleteMutation.mutate(a.id)} />
              )
            )}
          </div>
        )}

        {plans.length === 0 && !adding && (
          <div className="card text-center py-5">
            <p className="text-forest/40 text-sm">No activities yet.</p>
          </div>
        )}

        {adding && !editing && (
          <ActivityForm dayId={dayId} onDone={() => setAdding(false)} />
        )}
      </div>
    </div>
  )
}

// ─── Wallet section ───────────────────────────────────────────────────────────

const RES_ICONS: Record<string, string> = {
  flight: '✈️', hotel: '🏨', car: '🚗', restaurant: '🍴', activity: '🎯', other: '📋',
}

function fmtResTime(s: string | null) {
  if (!s) return null
  const [h, m] = s.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function WalletSection({ tripId, date }: { tripId: string; date: string | null }) {
  const { data: reservations = [] } = useQuery({
    queryKey: ['reservations-for-day', tripId, date],
    queryFn: async (): Promise<Reservation[]> => {
      if (!date) return []
      const { data, error } = await supabase
        .from('reservations').select('*')
        .eq('trip_id', tripId).eq('date', date).neq('type', 'hotel')
        .order('time', { nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!tripId && !!date,
  })

  if (!date || reservations.length === 0) return null

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="section-label mb-0">Wallet</p>
        <Link to="/wallet" className="text-xs text-sage hover:text-forest transition-colors">
          View all →
        </Link>
      </div>
      <div className="card divide-y divide-forest/5">
        {reservations.map((r) => (
          <div key={r.id} className="py-2.5 flex items-start gap-3">
            <span className="text-lg shrink-0 mt-0.5">{RES_ICONS[r.type ?? 'other']}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-forest truncate">{r.title || r.provider || r.type || '—'}</p>
              {r.provider && <p className="text-xs text-forest/50 truncate">{r.provider}</p>}
              <div className="flex flex-wrap gap-x-3 mt-0.5">
                {r.time && <span className="text-xs text-forest/50">{fmtResTime(r.time)}</span>}
                {r.confirmation_number && (
                  <span className="text-xs font-mono text-forest/40">#{r.confirmation_number}</span>
                )}
              </div>
              {r.address && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(r.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-deep-teal underline mt-0.5 block truncate"
                >
                  {r.address}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DayDetailPage() {
  const { dayId } = useParams<{ dayId: string }>()
  const tripId = useAppStore((s) => s.tripId)
  const navigate = useNavigate()

  const { data: day, isLoading } = useQuery({
    queryKey: ['day', dayId],
    queryFn: async (): Promise<Day | null> => {
      const { data, error } = await supabase
        .from('days').select('*').eq('id', dayId!).maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!dayId,
  })

  const queryClient = useQueryClient()

  const deleteDayMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('days').delete().eq('id', dayId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['days', tripId] })
      navigate('/days', { replace: true })
    },
  })

  if (isLoading) {
    return (
      <div className="p-4 pt-6 flex justify-center py-20">
        <p className="text-forest/40 text-sm">Loading…</p>
      </div>
    )
  }

  if (!day) {
    return (
      <div className="p-4 pt-6">
        <p className="text-forest/50 text-sm">Day not found.</p>
        <Link to="/days" className="text-sage text-sm underline mt-2 block">← Back to days</Link>
      </div>
    )
  }

  return (
    <div className="p-4 pt-4 pb-10">
      {/* Back + delete row */}
      <div className="flex items-center justify-between mb-4">
        <Link to="/days" className="flex items-center gap-1 text-sm text-sage hover:text-forest transition-colors">
          ← Days
        </Link>
        <button
          onClick={() => {
            if (confirm('Delete this day and all its data?')) deleteDayMutation.mutate()
          }}
          className="text-xs text-terracotta hover:text-forest transition-colors"
        >
          Delete day
        </button>
      </div>

      <DayHeader day={day} />
      <LodgingSection dayId={day.id} tripId={tripId} date={day.date} />
      <ActivitiesSection dayId={day.id} />
      {tripId && <WalletSection tripId={tripId} date={day.date} />}
    </div>
  )
}
