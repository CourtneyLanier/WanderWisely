import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useTrip } from '@/hooks/useTrip'
import ItineraryExport from '@/components/export/ItineraryExport'
import type { Budget, Day, Lodging, Activity, Reservation, Trip } from '@/types'

// ── Sync types ─────────────────────────────────────────────────────────────────

interface LocationChange {
  field: 'start_location' | 'end_location'
  current: string | null
  proposed: string
  source: string
}
interface NewActivity {
  name: string
  time: string | null
  address: string | null
  confirmation_number: string | null
}
interface DaySyncChange {
  dayId: string
  dayNumber: number
  date: string | null
  locationChanges: LocationChange[]
  newActivities: NewActivity[]
}

function fmtDay(dateStr: string | null) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export default function SettingsPage() {
  const { tripId, signOut } = useAppStore()
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
  const [hotelBuffer, setHotelBuffer] = useState('500')
  const [carBudget, setCarBudget] = useState('')

  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportingGpx, setExportingGpx] = useState(false)
  const [savingShare, setSavingShare] = useState(false)

  // Per-tab guest sharing flags (saved immediately, like the share switch)
  const [shareTabs, setShareTabs] = useState({
    share_days: true, share_route: true, share_wallet: false,
    share_budget: false, share_notes: false, share_map: false,
  })
  const [savingTab, setSavingTab] = useState<string | null>(null)

  // Sync from Wallet state
  const [buildingPreview, setBuildingPreview] = useState(false)
  const [syncPreview, setSyncPreview] = useState<DaySyncChange[] | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncApplied, setSyncApplied] = useState(false)
  // 'fill' = only populate blank locations (safe); 'overwrite' = replace existing ones too.
  const [syncMode, setSyncMode] = useState<'fill' | 'overwrite'>('fill')

  // ── Sync from Wallet ────────────────────────────────────────────────────────

  async function buildSyncPlan(mode: 'fill' | 'overwrite'): Promise<DaySyncChange[]> {
    if (!tripId) return []

    const [daysRes, reservationsRes, activitiesRes] = await Promise.all([
      supabase.from('days').select('*').eq('trip_id', tripId).order('day_number'),
      supabase.from('reservations').select('*').eq('trip_id', tripId).order('date', { nullsFirst: false }),
      supabase.from('activities').select('id, day_id, name, confirmation_number').order('sort_order'),
    ])

    const days: Day[] = daysRes.data ?? []
    const reservations: Reservation[] = reservationsRes.data ?? []
    const activities = activitiesRes.data ?? []

    // Index: date → day
    const dayByDate = new Map<string, Day>()
    for (const day of days) {
      if (day.date) dayByDate.set(day.date, day)
    }

    // Duplicate guards
    const existingConfNums = new Set(
      activities.filter((a) => a.confirmation_number).map((a) => a.confirmation_number!)
    )
    const existingDayName = new Set(
      activities.filter((a) => a.name).map((a) => `${a.day_id}::${a.name!.toLowerCase()}`)
    )

    const changeMap = new Map<string, DaySyncChange>()
    function getDayChange(day: Day): DaySyncChange {
      if (!changeMap.has(day.id)) {
        changeMap.set(day.id, {
          dayId: day.id, dayNumber: day.day_number, date: day.date,
          locationChanges: [], newActivities: [],
        })
      }
      return changeMap.get(day.id)!
    }

    // Sort hotel reservations by date
    const hotels = reservations
      .filter((r) => r.type === 'hotel' && r.date && r.address)
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

    // For each hotel check-in: propose end_location on that day and start_location from previous hotel
    for (let i = 0; i < hotels.length; i++) {
      const hotel = hotels[i]
      const day = dayByDate.get(hotel.date!)
      if (!day) continue

      // end_location = this hotel. Fill mode: only when blank. Overwrite mode:
      // whenever the existing value differs from the hotel address.
      const endNeedsChange = mode === 'overwrite'
        ? day.end_location !== hotel.address
        : !day.end_location
      if (endNeedsChange) {
        const dc = getDayChange(day)
        if (!dc.locationChanges.find((c) => c.field === 'end_location')) {
          dc.locationChanges.push({
            field: 'end_location',
            current: day.end_location,
            proposed: hotel.address!,
            source: hotel.title || hotel.provider || 'Hotel',
          })
        }
      }

      // start_location = previous hotel address (same fill/overwrite rule).
      if (i > 0) {
        const prevHotel = hotels[i - 1]
        const startNeedsChange = mode === 'overwrite'
          ? day.start_location !== prevHotel.address
          : !day.start_location
        if (startNeedsChange) {
          const dc = getDayChange(day)
          if (!dc.locationChanges.find((c) => c.field === 'start_location')) {
            dc.locationChanges.push({
              field: 'start_location',
              current: day.start_location,
              proposed: prevHotel.address!,
              source: prevHotel.title || prevHotel.provider || 'Hotel',
            })
          }
        }
      }
    }

    // Activity/restaurant reservations → propose as activities on matching day
    const actRes = reservations.filter(
      (r) => (r.type === 'activity' || r.type === 'restaurant') && r.date
    )
    for (const res of actRes) {
      const day = dayByDate.get(res.date!)
      if (!day) continue

      // Duplicate check
      if (res.confirmation_number && existingConfNums.has(res.confirmation_number)) continue
      const nameKey = `${day.id}::${(res.title || res.provider || '').toLowerCase()}`
      if ((res.title || res.provider) && existingDayName.has(nameKey)) continue

      getDayChange(day).newActivities.push({
        name: res.title || res.provider || 'Reservation',
        time: res.time,
        address: res.address,
        confirmation_number: res.confirmation_number,
      })
    }

    return [...changeMap.values()].filter(
      (c) => c.locationChanges.length > 0 || c.newActivities.length > 0
    )
  }

  async function handleBuildPreview(mode: 'fill' | 'overwrite') {
    setSyncMode(mode)
    setBuildingPreview(true)
    try {
      const plan = await buildSyncPlan(mode)
      setSyncPreview(plan)
    } finally {
      setBuildingPreview(false)
    }
  }

  async function applySyncPlan(plan: DaySyncChange[]) {
    setSyncing(true)
    try {
      for (const dc of plan) {
        // Apply location changes
        if (dc.locationChanges.length > 0) {
          const updates: { start_location?: string; end_location?: string } = {}
          for (const lc of dc.locationChanges) updates[lc.field] = lc.proposed
          await supabase.from('days').update(updates).eq('id', dc.dayId)
        }

        // Insert new activities
        for (const act of dc.newActivities) {
          const { data: existing } = await supabase
            .from('activities').select('sort_order').eq('day_id', dc.dayId)
            .order('sort_order', { ascending: false }).limit(1)
          const nextSort = existing?.[0]?.sort_order != null ? existing[0].sort_order + 1 : 0
          await supabase.from('activities').insert({
            day_id: dc.dayId,
            name: act.name,
            type: 'reservation' as const,
            time: act.time,
            address: act.address,
            confirmation_number: act.confirmation_number,
            is_booked: true,
            sort_order: nextSort,
          })
        }
      }

      queryClient.invalidateQueries({ queryKey: ['days', tripId] })
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      setSyncPreview(null)
      setSyncApplied(true)
      setTimeout(() => setSyncApplied(false), 3000)
    } finally {
      setSyncing(false)
    }
  }


  // ── Garmin GPX export ────────────────────────────────────────────────────────

  async function exportGarminGpx() {
    if (!trip || !tripId) return
    setExportingGpx(true)
    try {
      const daysRes = await supabase
        .from('days').select('*').eq('trip_id', tripId).order('day_number')
      const days: Day[] = daysRes.data ?? []

      // Nominatim geocode (rate-limited: 1 req/s per usage policy)
      async function geocode(address: string): Promise<{ lat: number; lon: number } | null> {
        await new Promise((r) => setTimeout(r, 1100))
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
          const res = await fetch(url, { headers: { 'User-Agent': 'WanderWisely/1.0' } })
          const data = await res.json() as { lat: string; lon: string }[]
          if (data[0]) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
        } catch { /* skip */ }
        return null
      }

      const waypoints: string[] = []

      // End-of-day stops (hotels / destinations)
      for (const day of days) {
        const addr = day.end_location
        if (!addr) continue
        const coords = await geocode(addr)
        if (!coords) continue
        const dateStr = day.date ?? ''
        const label = `Day ${day.day_number}${dateStr ? ' ' + dateStr : ''}`
        waypoints.push(
          `  <wpt lat="${coords.lat.toFixed(6)}" lon="${coords.lon.toFixed(6)}">\n` +
          `    <name>${label}</name>\n` +
          `    <desc>${addr.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</desc>\n` +
          `    <sym>Hotel</sym>\n` +
          `  </wpt>`
        )
      }

      if (!waypoints.length) {
        alert('No geocodable stops found. Make sure your days have end locations set.')
        return
      }

      const gpx = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="WanderWisely" xmlns="http://www.topografix.com/GPX/1/1">',
        `  <metadata><name>${trip.name.replace(/&/g, '&amp;')}</name></metadata>`,
        ...waypoints,
        '</gpx>',
      ].join('\n')

      const blob = new Blob([gpx], { type: 'application/gpx+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${trip.name.replace(/[^a-z0-9]/gi, '_')}_garmin.gpx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportingGpx(false)
    }
  }

  // ── Export addresses ────────────────────────────────────────────────────────

  async function exportAddresses() {
    if (!trip || !tripId) return
    setExporting(true)
    try {
      // Fetch all data for the trip
      const [daysRes, reservationsRes] = await Promise.all([
        supabase.from('days').select('*').eq('trip_id', tripId).order('day_number'),
        supabase.from('reservations').select('*').eq('trip_id', tripId).order('date', { nullsFirst: false }),
      ])

      const days: Day[] = daysRes.data ?? []
      const dayIds = days.map((d) => d.id)

      const [lodgingRes, activitiesRes] = dayIds.length
        ? await Promise.all([
            supabase.from('lodging').select('*').in('day_id', dayIds),
            supabase.from('activities').select('*').in('day_id', dayIds).order('sort_order').order('time'),
          ])
        : [{ data: [] }, { data: [] }]

      const allLodging: Lodging[] = lodgingRes.data ?? []
      const allActivities: Activity[] = activitiesRes.data ?? []
      const reservations: Reservation[] = reservationsRes.data ?? []

      const mapsUrl = (addr: string) =>
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`

      const lines: string[] = []
      const divider = '═'.repeat(48)

      lines.push(`WanderWisely — ${trip.name}`)
      if (trip.start_date && trip.end_date) {
        const s = new Date(trip.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        const e = new Date(trip.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        lines.push(`${s} – ${e}`)
      }
      lines.push(`Exported: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`)
      lines.push('')
      lines.push(divider)
      lines.push('DAILY ROUTE & ADDRESSES')
      lines.push(divider)

      for (const day of days) {
        const dateStr = day.date
          ? new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
          : 'Date TBD'
        lines.push('')
        lines.push(`DAY ${day.day_number} — ${dateStr}`)

        if (day.start_location) {
          lines.push(`  FROM: ${day.start_location}`)
          lines.push(`  Maps: ${mapsUrl(day.start_location)}`)
        }
        if (day.end_location) {
          lines.push(`  TO:   ${day.end_location}`)
          lines.push(`  Maps: ${mapsUrl(day.end_location)}`)
        }
        if (day.drive_hours || day.drive_miles) {
          const parts = []
          if (day.drive_hours) parts.push(`${day.drive_hours} hrs`)
          if (day.drive_miles) parts.push(`${day.drive_miles} mi`)
          lines.push(`  Drive: ${parts.join(' · ')}`)
        }
        if (day.departure_time) {
          lines.push(`  Depart: ${day.departure_time.slice(0, 5)}`)
        }

        // Lodging
        const lodging = allLodging.find((l) => l.day_id === day.id)
        if (lodging) {
          lines.push('')
          lines.push(`  🏨 LODGING: ${lodging.name ?? 'Hotel'}`)
          if (lodging.type) lines.push(`     Type: ${lodging.type}${lodging.room_type ? ` · ${lodging.room_type}` : ''}`)
          if (lodging.address) {
            lines.push(`     Address: ${lodging.address}`)
            lines.push(`     Maps: ${mapsUrl(lodging.address)}`)
          }
          if (lodging.check_in_time || lodging.check_out_time) {
            lines.push(`     Check-in: ${lodging.check_in_time ?? '—'}  Check-out: ${lodging.check_out_time ?? '—'}`)
          }
          if (lodging.confirmation_number) lines.push(`     Confirmation: #${lodging.confirmation_number}`)
        }

        // Meals
        const dayActivities = allActivities.filter((a) => a.day_id === day.id)
        const SLOT_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }
        const meals = dayActivities
          .filter((a) => a.type === 'meal' && a.name)
          .sort((a, b) => (SLOT_ORDER[a.meal_slot ?? ''] ?? 99) - (SLOT_ORDER[b.meal_slot ?? ''] ?? 99))
        if (meals.length > 0) {
          lines.push('')
          lines.push('  🍽️  MEALS:')
          for (const meal of meals) {
            const slot = meal.meal_slot ? meal.meal_slot.charAt(0).toUpperCase() + meal.meal_slot.slice(1) : 'Meal'
            lines.push(`     ${slot}: ${meal.name}`)
            if (meal.address) {
              lines.push(`       Address: ${meal.address}`)
              lines.push(`       Maps: ${mapsUrl(meal.address)}`)
            }
            if (meal.time) lines.push(`       Time: ${meal.time.slice(0, 5)}`)
          }
        }

        // Activities / plans
        const plans = dayActivities.filter((a) => a.type !== 'meal' && a.name)
        if (plans.length > 0) {
          lines.push('')
          lines.push('  🎯 ACTIVITIES:')
          for (const a of plans) {
            const typeLabel = a.type === 'main' ? 'Main' : a.type === 'side_quest' ? 'Side quest' : a.type ?? 'Activity'
            lines.push(`     [${typeLabel}] ${a.name}`)
            if (a.address) {
              lines.push(`       Address: ${a.address}`)
              lines.push(`       Maps: ${mapsUrl(a.address)}`)
            }
            if (a.time) lines.push(`       Time: ${a.time.slice(0, 5)}`)
            if (a.confirmation_number) lines.push(`       Confirmation: #${a.confirmation_number}`)
          }
        }

        lines.push('')
      }

      // Reservations with addresses
      const resWithAddr = reservations.filter((r) => r.address)
      if (resWithAddr.length > 0) {
        lines.push(divider)
        lines.push('WALLET — ALL RESERVATION ADDRESSES')
        lines.push(divider)
        lines.push('')
        for (const r of resWithAddr) {
          const dateStr = r.date
            ? new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : null
          lines.push(`${r.type?.toUpperCase() ?? 'OTHER'}: ${r.title || r.provider || '—'}${dateStr ? ` (${dateStr})` : ''}`)
          lines.push(`  Address: ${r.address}`)
          lines.push(`  Maps: ${mapsUrl(r.address!)}`)
          if (r.confirmation_number) lines.push(`  Confirmation: #${r.confirmation_number}`)
          lines.push('')
        }
      }

      // Download
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${trip.name.replace(/[^a-z0-9]/gi, '_')}_addresses.txt`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    if (!trip) return
    setName(trip.name ?? '')
    setStartDate(trip.start_date ?? '')
    setEndDate(trip.end_date ?? '')
    setShareEnabled(trip.share_enabled)
    setShareTabs({
      share_days: trip.share_days ?? true,
      share_route: trip.share_route ?? true,
      share_wallet: trip.share_wallet ?? false,
      share_budget: trip.share_budget ?? false,
      share_notes: trip.share_notes ?? false,
      share_map: trip.share_map ?? false,
    })
  }, [trip])

  async function toggleShareTab(key: keyof typeof shareTabs) {
    if (!trip) return
    const next = !shareTabs[key]
    setShareTabs((prev) => ({ ...prev, [key]: next }))
    setSavingTab(key)
    try {
      // key is constrained to the share-flag keys, so this cast is safe.
      const patch = { [key]: next } as Partial<Pick<Trip, keyof typeof shareTabs>>
      await supabase.from('trips').update(patch).eq('id', trip.id)
      queryClient.invalidateQueries({ queryKey: ['trip'] })
    } finally {
      setSavingTab(null)
    }
  }

  useEffect(() => {
    if (!budget) return
    setFoodTotal(String(budget.food_total ?? ''))
    setFoodDays(String(budget.food_days ?? ''))
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
      if (!trip || !tripId) throw new Error('No trip selected')

      const { error: tripError } = await supabase
        .from('trips')
        .update({
          name,
          start_date: startDate || null,
          end_date: endDate || null,
          num_days: numDays,
          share_enabled: shareEnabled,
        })
        .eq('id', trip.id)
      if (tripError) throw tripError

      const { error: budgetError } = await supabase.from('budget').upsert(
        {
          trip_id: tripId,
          food_total: parseFloat(foodTotal) || 0,
          food_days: parseInt(foodDays) || 0,
          hotel_total: 0,
          hotel_buffer: parseFloat(hotelBuffer) || 500,
          car_total_budget: parseFloat(carBudget) || 0,
        },
        { onConflict: 'trip_id' }
      )
      if (budgetError) throw budgetError
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

  if (!trip) {
    return (
      <div className="p-4 pt-6 pb-10">
        <h1 className="font-display text-2xl text-forest mb-4">Settings</h1>
        <div className="card text-center py-12 space-y-3">
          <p className="text-forest/50 text-sm">No trip selected.</p>
          <Link to="/trips" className="btn-primary inline-block">Go to My Trips</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 pt-6 pb-10">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="font-display text-2xl text-forest">Settings</h1>
        <Link to="/trips" className="text-xs text-sage hover:text-forest transition-colors">
          Switch trip ↗
        </Link>
      </div>

      <div className="space-y-4">

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
              <div>
                <label className="block text-sm text-forest mb-1">Car budget ($)</label>
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
        </div>

        {/* ── Sync from Wallet ── */}
        {trip && (
          <div className="card">
            <p className="section-label">Sync from Wallet</p>
            <p className="text-sm text-forest/60 mb-3">
              Auto-fill day locations and add reservations as activities from your Wallet. Choose how
              to handle days that already have locations set — you'll preview every change before it's applied.
            </p>

            {syncApplied && (
              <p className="text-sm text-sage text-center mb-2">✓ Changes applied!</p>
            )}

            {syncPreview === null ? (
              <div className="space-y-2">
                <button
                  onClick={() => handleBuildPreview('fill')}
                  disabled={buildingPreview}
                  className="btn-secondary w-full text-sm flex items-center justify-center gap-2"
                >
                  {buildingPreview && syncMode === 'fill' ? (
                    <><span className="animate-pulse">⏳</span><span>Building preview…</span></>
                  ) : (
                    <><span>🔄</span><span>Fill blanks only (keep what I entered)</span></>
                  )}
                </button>
                <button
                  onClick={() => handleBuildPreview('overwrite')}
                  disabled={buildingPreview}
                  className="btn-secondary w-full text-sm flex items-center justify-center gap-2"
                >
                  {buildingPreview && syncMode === 'overwrite' ? (
                    <><span className="animate-pulse">⏳</span><span>Building preview…</span></>
                  ) : (
                    <><span>⚠️</span><span>Overwrite existing locations</span></>
                  )}
                </button>
              </div>
            ) : syncPreview.length === 0 ? (
              <div className="space-y-3">
                <div className="bg-sage/10 rounded-lg px-3 py-3 text-sm text-forest/70 text-center">
                  Everything is already up to date — no changes needed.
                </div>
                <button
                  onClick={() => setSyncPreview(null)}
                  className="btn-secondary w-full text-sm"
                >
                  Dismiss
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-forest/50">
                  {syncMode === 'overwrite' ? 'Overwrite mode — ' : 'Fill-blanks mode — '}
                  {syncPreview.length} day{syncPreview.length !== 1 ? 's' : ''} will be updated:
                </p>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {syncPreview.map((dc) => (
                    <div key={dc.dayId} className="bg-cream rounded-lg p-3">
                      <p className="text-xs font-semibold text-forest mb-1.5">
                        Day {dc.dayNumber}{dc.date ? ` · ${fmtDay(dc.date)}` : ''}
                      </p>
                      {dc.locationChanges.map((lc, i) => (
                        <p key={i} className="text-xs text-forest/70 mb-1 leading-relaxed">
                          <span className="font-medium text-forest/80">
                            {lc.field === 'start_location' ? 'From' : 'To'}:
                          </span>{' '}
                          <span className="text-sage font-medium">{lc.proposed}</span>
                          {lc.current && (
                            <span className="text-terracotta/70"> (replaces: {lc.current})</span>
                          )}
                          <span className="text-forest/40"> — from {lc.source}</span>
                        </p>
                      ))}
                      {dc.newActivities.map((act, i) => (
                        <p key={i} className="text-xs text-forest/70 mb-1 leading-relaxed">
                          <span className="font-medium text-forest/80">+ Activity:</span>{' '}
                          <span className="text-sage font-medium">{act.name}</span>
                          {act.time && (
                            <span className="text-forest/40"> at {act.time.slice(0, 5)}</span>
                          )}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSyncPreview(null)}
                    disabled={syncing}
                    className="btn-secondary flex-1 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => applySyncPlan(syncPreview)}
                    disabled={syncing}
                    className="btn-primary flex-1 text-sm"
                  >
                    {syncing ? 'Applying…' : 'Apply changes'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Export ── */}
        {trip && (
          <div className="card">
            <p className="section-label">Export</p>

            {/* Itinerary & meal plan — branded HTML slideshow / PDF */}
            <ItineraryExport tripId={tripId!} />

            {/* Address text file */}
            <p className="text-sm text-forest/60 mb-2 mt-6 pt-4 border-t border-forest/10">
              Download all addresses as a plain-text file organized by day with Google Maps links.
            </p>
            <button
              onClick={exportAddresses}
              disabled={exporting}
              className="btn-secondary w-full text-sm flex items-center justify-center gap-2 mb-4"
            >
              {exporting ? (
                <><span className="animate-pulse">⏳</span><span>Gathering addresses…</span></>
              ) : (
                <><span>📍</span><span>Export addresses (.txt)</span></>
              )}
            </button>

            {/* Garmin GPX */}
            <p className="text-sm text-forest/60 mb-1">
              Export all daily stops as a GPX waypoints file for your Garmin GPS.
            </p>
            <p className="text-xs text-forest/40 mb-2">
              Import via USB: connect your Garmin, copy the .gpx file to the <span className="font-mono">GPX</span> folder, then eject. Your stops will appear under Saved Places. The geocoding takes ~1 second per stop.
            </p>
            <button
              onClick={exportGarminGpx}
              disabled={exportingGpx}
              className="btn-secondary w-full text-sm flex items-center justify-center gap-2"
            >
              {exportingGpx ? (
                <><span className="animate-pulse">⏳</span><span>Geocoding stops…</span></>
              ) : (
                <><span>🧭</span><span>Export for Garmin (.gpx)</span></>
              )}
            </button>
          </div>
        )}

        {/* ── Guest Sharing ── */}
        <div className="card">
          <p className="section-label">Guest Sharing</p>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-forest">Share link enabled</span>
            <button
              role="switch"
              aria-checked={shareEnabled}
              disabled={savingShare}
              onClick={async () => {
                if (!trip) return
                const next = !shareEnabled
                setShareEnabled(next)
                setSavingShare(true)
                try {
                  await supabase
                    .from('trips')
                    .update({ share_enabled: next })
                    .eq('id', trip.id)
                  queryClient.invalidateQueries({ queryKey: ['trip'] })
                } finally {
                  setSavingShare(false)
                }
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                shareEnabled ? 'bg-sage' : 'bg-forest/20'
              } ${savingShare ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  shareEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          {/* Per-tab sharing — what guests can see on THIS trip */}
          {shareEnabled && (
            <div className="mb-4 pt-3 border-t border-forest/10">
              <p className="text-xs text-forest/50 mb-2">
                Choose what guests see on this trip. Money is never shared unless you turn on Budget.
              </p>
              <div className="space-y-1">
                {([
                  { key: 'share_days',   icon: '📅', label: 'Days',   note: 'daily plans, lodging, meals' },
                  { key: 'share_route',  icon: '🧭', label: 'Route',  note: 'drive legs and stops' },
                  { key: 'share_wallet', icon: '💳', label: 'Wallet', note: 'reservations — never costs' },
                  { key: 'share_budget', icon: '💰', label: 'Budget', note: 'budget totals and spending' },
                  { key: 'share_notes',  icon: '📝', label: 'Notes',  note: 'notes + document text/links' },
                  { key: 'share_map',    icon: '🗺️', label: 'Map',    note: 'states visited' },
                ] as { key: keyof typeof shareTabs; icon: string; label: string; note: string }[]).map(
                  ({ key, icon, label, note }) => (
                    <label
                      key={key}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-cream cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={shareTabs[key]}
                        disabled={savingTab === key}
                        onChange={() => toggleShareTab(key)}
                        className="accent-sage w-4 h-4 shrink-0"
                      />
                      <span className="text-base shrink-0">{icon}</span>
                      <span className="text-sm text-forest font-medium shrink-0">{label}</span>
                      <span className="text-xs text-forest/40 truncate">{note}</span>
                    </label>
                  )
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs text-forest/50 break-all font-mono">{guestLink}</p>
            <button onClick={copyLink} className="btn-secondary w-full text-sm">
              {copied ? '✓ Copied!' : 'Copy guest link'}
            </button>
          </div>
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
          {saveMutation.isPending ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </button>

        <button onClick={signOut} className="btn-secondary w-full">
          Sign out
        </button>
      </div>
    </div>
  )
}
