import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { dayTitle } from '@/lib/dayTitle'
import { useAppStore } from '@/store/useAppStore'
import SuggestStopsSection from '@/components/days/SuggestStopsSection'
import DayWeatherCard from '@/components/days/DayWeatherCard'
import { weatherLocations } from '@/lib/weather'
import FileViewer from '@/components/files/FileViewer'
import { reservationPdfRef, MAX_PARSE_PDF_BYTES } from '@/lib/reservationPdfs'
import type { StoredFileRef } from '@/lib/storedFiles'
import type { Day, Lodging, Activity, LodgingType, ActivityType, MealSlot, Reservation } from '@/types'

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
}

// ─── Day header edit form ─────────────────────────────────────────────────────

function DayHeader({
  day,
  editing,
  setEditing,
  weatherLocOpen,
  setWeatherLocOpen,
}: {
  day: Day
  // Editing is lifted so the weather card's "Set a weather location" prompt can
  // open this form straight to the field that fixes the problem.
  editing: boolean
  setEditing: (v: boolean) => void
  weatherLocOpen: boolean
  setWeatherLocOpen: (v: boolean) => void
}) {
  const queryClient = useQueryClient()
  const tripId = useAppStore((s) => s.tripId)
  const [startLoc, setStartLoc] = useState(day.start_location ?? '')
  const [endLoc, setEndLoc] = useState(day.end_location ?? '')
  const [startWeatherLoc, setStartWeatherLoc] = useState(day.start_weather_location ?? '')
  const [endWeatherLoc, setEndWeatherLoc] = useState(day.end_weather_location ?? '')
  const [miles, setMiles] = useState(String(day.drive_miles ?? ''))
  const [hours, setHours] = useState(String(day.drive_hours ?? ''))
  const [notes, setNotes] = useState(day.notes ?? '')
  const [date, setDate] = useState(day.date ?? '')
  const [departureTime, setDepartureTime] = useState(day.departure_time ?? '')

  // ── Auto-fill queries ──
  const { data: dayReservations = [] } = useQuery({
    queryKey: ['reservations-autofill', tripId, day.date],
    queryFn: async () => {
      if (!tripId || !day.date) return []
      const { data } = await supabase
        .from('reservations').select('type, address')
        .eq('trip_id', tripId).eq('date', day.date)
        .not('address', 'is', null)
      return (data ?? []) as { type: string; address: string }[]
    },
    enabled: !!tripId && !!day.date,
  })

  const { data: prevDay } = useQuery({
    queryKey: ['prev-day-autofill', tripId, day.day_number],
    queryFn: async () => {
      if (!tripId || day.day_number <= 1) return null
      const { data } = await supabase
        .from('days').select('end_location, date')
        .eq('trip_id', tripId).eq('day_number', day.day_number - 1)
        .maybeSingle()
      return data as { end_location: string | null; date: string | null } | null
    },
    enabled: !!tripId && day.day_number > 1,
  })

  const { data: prevDayHotel } = useQuery({
    queryKey: ['prev-day-hotel-autofill', tripId, prevDay?.date],
    queryFn: async () => {
      if (!tripId || !prevDay?.date) return null
      const { data } = await supabase
        .from('reservations').select('address')
        .eq('trip_id', tripId).eq('date', prevDay.date).eq('type', 'hotel')
        .not('address', 'is', null)
        .maybeSingle()
      return data as { address: string } | null
    },
    enabled: !!tripId && !!prevDay?.date && !prevDay?.end_location,
  })

  function autoFill() {
    const suggestedStart = prevDay?.end_location || prevDayHotel?.address || ''
    const hotelAddr = dayReservations.find((r) => r.type === 'hotel')?.address
    const anyAddr = dayReservations[0]?.address
    const suggestedEnd = hotelAddr || anyAddr || ''
    if (suggestedStart && !startLoc) setStartLoc(suggestedStart)
    if (suggestedEnd && !endLoc) setEndLoc(suggestedEnd)
    setEditing(true)
  }

  const canAutoFill = !!day.date && (dayReservations.length > 0 || !!prevDay?.end_location || !!prevDayHotel?.address)

  // Auto-fill when edit form opens and fields are empty
  useEffect(() => {
    if (!editing || !canAutoFill) return
    if (!startLoc) {
      const suggested = prevDay?.end_location || prevDayHotel?.address || ''
      if (suggested) setStartLoc(suggested)
    }
    if (!endLoc) {
      const hotelAddr = dayReservations.find((r) => r.type === 'hotel')?.address
      const anyAddr = dayReservations[0]?.address
      const suggested = hotelAddr || anyAddr || ''
      if (suggested) setEndLoc(suggested)
    }
  }, [editing])

  useEffect(() => {
    setStartLoc(day.start_location ?? '')
    setEndLoc(day.end_location ?? '')
    setStartWeatherLoc(day.start_weather_location ?? '')
    setEndWeatherLoc(day.end_weather_location ?? '')
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
          start_weather_location: startWeatherLoc || null,
          end_weather_location: endWeatherLoc || null,
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
              {dayTitle(day.start_location, day.end_location)}
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
        <div className="flex items-center gap-3 ml-2">
          {!editing && canAutoFill && (!day.start_location || !day.end_location) && (
            <button
              onClick={autoFill}
              className="text-xs text-deep-teal hover:text-forest transition-colors"
              title="Fill locations from your reservations"
            >
              ✨ Auto-fill
            </button>
          )}
          <button
            onClick={() => setEditing(!editing)}
            className="text-xs text-sage hover:text-forest transition-colors"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
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

          {/* Weather-location override — kept out of the way. Opens itself when
              an override is already set, or when the weather card sent you here
              because it couldn't find the place. */}
          <div>
            <button
              type="button"
              onClick={() => setWeatherLocOpen(!weatherLocOpen)}
              className="text-xs text-forest/50 hover:text-forest transition-colors"
            >
              {weatherLocOpen ? '▾' : '▸'} Weather location
            </button>
            {weatherLocOpen && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-forest/50">
                  Only needed when a From/To can't be found on the map — use a nearby town.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-forest/60 mb-1">Morning weather</label>
                    <input type="text" value={startWeatherLoc}
                      onChange={(e) => setStartWeatherLoc(e.target.value)}
                      placeholder="Yosemite Valley, CA" className="input" />
                  </div>
                  <div>
                    <label className="block text-xs text-forest/60 mb-1">Night weather</label>
                    <input type="text" value={endWeatherLoc}
                      onChange={(e) => setEndWeatherLoc(e.target.value)}
                      placeholder="Yosemite Valley, CA" className="input" />
                  </div>
                </div>
              </div>
            )}
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
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [copiedConf, setCopiedConf] = useState(false)
  // Confirmation PDFs live in a private bucket — they open in the in-app viewer,
  // never as a link. See src/lib/reservationPdfs.ts.
  const [viewingPdf, setViewingPdf] = useState<StoredFileRef | null>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  function copyConf(num: string) {
    navigator.clipboard.writeText(num)
    setCopiedConf(true)
    setTimeout(() => setCopiedConf(false), 2000)
  }

  async function parsePdf(file: File) {
    setParsing(true)
    setParseError('')
    try {
      if (file.size > MAX_PARSE_PDF_BYTES) {
        throw new Error(`PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB — please use a file under 5 MB.`)
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const { data, error } = await supabase.functions.invoke('parse-with-claude', {
        body: { mode: 'pdf', pdfBase64: base64 },
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error ?? 'Unknown error')
      const raw = data.text as string
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      const json = start !== -1 && end !== -1 ? JSON.parse(raw.slice(start, end + 1)) : {}
      const s = (k: string) => (typeof json[k] === 'string' ? json[k] as string : '')
      const det = (json.details && typeof json.details === 'object' && !Array.isArray(json.details))
        ? json.details as Record<string, unknown>
        : {}
      const detStr = (k: string) => (det[k] != null ? String(det[k]) : '')

      // Detect lodging type from provider/title
      const nameStr = (s('title') || s('provider')).toLowerCase()
      const lodgingType = nameStr.includes('airbnb') ? 'airbnb'
        : nameStr.includes('vrbo') || nameStr.includes('vacation rental') ? 'other'
        : 'hotel'

      setF((prev) => ({
        ...prev,
        name: s('title') || s('provider') || prev.name,
        type: lodgingType as typeof prev.type,
        address: s('address') || prev.address,
        listing_url: s('listing_url') || prev.listing_url,
        confirmation_number: s('confirmation_number') || prev.confirmation_number,
        check_in_time: s('time') ? s('time').slice(0, 5) : prev.check_in_time,
        check_out_time: detStr('check_out_time') || prev.check_out_time,
        room_type: detStr('room_type') || prev.room_type,
        nightly_rate: detStr('nightly_rate') || prev.nightly_rate,
        total_cost: json.cost != null ? String(json.cost) : prev.total_cost,
        bedrooms: detStr('bedrooms') || prev.bedrooms,
        beds: detStr('beds') || prev.beds,
        bathrooms: detStr('bathrooms') || prev.bathrooms,
      }))
      setEditing(true)
    } catch (e) {
      setParseError((e as Error).message ?? 'Failed to parse PDF')
    } finally {
      setParsing(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

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

  function fillFromReservation(r: Reservation) {
    const det = (r.details && typeof r.details === 'object' && !Array.isArray(r.details))
      ? r.details as Record<string, unknown>
      : {}
    const detStr = (k: string) => (det[k] != null ? String(det[k]) : '')
    setF((prev) => ({
      ...prev,
      name: prev.name || (r.title || r.provider || ''),
      address: prev.address || (r.address || ''),
      listing_url: prev.listing_url || (r.listing_url || ''),
      confirmation_number: prev.confirmation_number || (r.confirmation_number || ''),
      check_in_time: prev.check_in_time || (r.time ? r.time.slice(0, 5) : ''),
      check_out_time: prev.check_out_time || detStr('check_out_time'),
      room_type: prev.room_type || detStr('room_type'),
      nightly_rate: prev.nightly_rate || detStr('nightly_rate'),
      total_cost: prev.total_cost || (r.cost != null ? String(r.cost) : ''),
      bedrooms: prev.bedrooms || detStr('bedrooms'),
      beds: prev.beds || detStr('beds'),
      bathrooms: prev.bathrooms || detStr('bathrooms'),
    }))
    setEditing(true)
  }

  const canFillFromWallet = hotelReservations.length > 0

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="section-label mb-0">Lodging</p>
        <div className="flex items-center gap-3">
          {!editing && canFillFromWallet && (
            <button
              onClick={() => fillFromReservation(hotelReservations[0])}
              className="text-xs text-deep-teal hover:text-forest transition-colors"
              title="Fill lodging form from your Wallet reservation"
            >
              ✨ Wallet
            </button>
          )}
          {!editing && (
            <button
              onClick={() => pdfInputRef.current?.click()}
              disabled={parsing}
              className="text-xs text-deep-teal hover:text-forest transition-colors"
              title="Parse a confirmation PDF to fill lodging details"
            >
              {parsing ? '✨ Parsing…' : '📄 PDF'}
            </button>
          )}
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) parsePdf(file)
            }}
          />
          {!editing && (
            <button onClick={() => setEditing(true)}
              className="text-xs text-sage hover:text-forest transition-colors">
              {lodging ? 'Edit' : '+ Add'}
            </button>
          )}
        </div>
      </div>

      {parseError && (
        <p className="text-xs text-terracotta mb-2">{parseError}</p>
      )}

      {!editing && lodging && (
        <div className="card space-y-3">
          {/* Name + listing link */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-forest leading-snug">{lodging.name}</p>
              {lodging.room_type && (
                <p className="text-xs text-forest/60 mt-0.5">{lodging.room_type}</p>
              )}
            </div>
            {lodging.listing_url && (
              <a
                href={lodging.listing_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs font-medium text-white bg-deep-teal rounded-md px-2.5 py-1 hover:bg-forest transition-colors"
              >
                View listing ↗
              </a>
            )}
          </div>

          {/* Beds / Baths row */}
          {(lodging.beds || lodging.bedrooms || lodging.bathrooms) && (
            <div className="flex gap-2 flex-wrap">
              {lodging.beds != null && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-forest bg-sage/15 rounded-full px-2.5 py-1">
                  🛏 {lodging.beds} bed{lodging.beds !== 1 ? 's' : ''}
                </span>
              )}
              {lodging.bedrooms != null && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-forest bg-sage/15 rounded-full px-2.5 py-1">
                  🚪 {lodging.bedrooms} bedroom{lodging.bedrooms !== 1 ? 's' : ''}
                </span>
              )}
              {lodging.bathrooms != null && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-forest bg-sage/15 rounded-full px-2.5 py-1">
                  🚿 {lodging.bathrooms} bath{lodging.bathrooms !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          {/* Check-in / Check-out */}
          {(lodging.check_in_time || lodging.check_out_time) && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-cream rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-forest/40 font-medium mb-0.5">Check-in</p>
                <p className="text-sm font-semibold text-forest">
                  {lodging.check_in_time ? (() => {
                    const [h, m] = lodging.check_in_time!.split(':').map(Number)
                    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
                  })() : '—'}
                </p>
              </div>
              <div className="bg-cream rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-forest/40 font-medium mb-0.5">Check-out</p>
                <p className="text-sm font-semibold text-forest">
                  {lodging.check_out_time ? (() => {
                    const [h, m] = lodging.check_out_time!.split(':').map(Number)
                    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
                  })() : '—'}
                </p>
              </div>
            </div>
          )}

          {/* Confirmation # + address + pdf row */}
          <div className="flex flex-wrap items-center gap-2">
            {lodging.confirmation_number && (
              <button
                onClick={() => copyConf(lodging.confirmation_number!)}
                className="inline-flex items-center gap-1.5 text-xs font-mono text-deep-teal bg-deep-teal/8 hover:bg-deep-teal/15 rounded px-2 py-1 transition-colors"
              >
                {copiedConf ? '✓ Copied!' : `#${lodging.confirmation_number}`}
                {!copiedConf && <span className="text-deep-teal/50">⎘</span>}
              </button>
            )}
            {(lodging.address || hotelReservations[0]?.address) && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(lodging.address || hotelReservations[0].address!)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-deep-teal hover:text-forest transition-colors"
              >
                📍 Map
              </a>
            )}
            {hotelReservations[0] && reservationPdfRef(hotelReservations[0]) && (
              <button
                onClick={() => setViewingPdf(reservationPdfRef(hotelReservations[0]))}
                className="text-xs text-deep-teal hover:text-forest transition-colors"
              >
                📄 PDF
              </button>
            )}
            {(lodging.nightly_rate || lodging.total_cost) && (
              <span className="text-xs text-gold font-mono ml-auto">
                {lodging.nightly_rate ? `$${lodging.nightly_rate}/night` : ''}
                {lodging.nightly_rate && lodging.total_cost ? ' · ' : ''}
                {lodging.total_cost ? `$${lodging.total_cost} total` : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {!editing && !lodging && hotelReservations.length === 0 && (
        <div className="card text-center py-6">
          <p className="text-forest/40 text-sm">No lodging added yet.</p>
        </div>
      )}

      {!editing && !lodging && hotelReservations.length > 0 && (
        <div className="space-y-2 mt-2">
          {hotelReservations.map((r) => (
            <div key={r.id} className="card border-l-2 border-l-deep-teal/30">
              <div className="flex items-start gap-2">
                <span className="text-base shrink-0">🏨</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-forest">
                    {r.title || r.provider || 'Hotel Reservation'}
                  </p>
                  {r.provider && r.title && (
                    <p className="text-xs text-forest/50">{r.provider}</p>
                  )}
                  {r.confirmation_number && (
                    <p className="text-xs font-mono text-forest/40 mt-0.5">#{r.confirmation_number}</p>
                  )}
                  {r.address && (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(r.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-deep-teal underline mt-0.5 block"
                    >
                      {r.address}
                    </a>
                  )}
                  {r.cost != null && (
                    <p className="text-xs font-mono text-gold mt-0.5">
                      ${r.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                  {reservationPdfRef(r) && (
                    <button
                      onClick={() => setViewingPdf(reservationPdfRef(r))}
                      className="text-xs text-deep-teal underline mt-1 block">
                      📄 View PDF
                    </button>
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

      {viewingPdf && (
        <FileViewer file={viewingPdf} onClose={() => setViewingPdf(null)} />
      )}
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

const MEAL_ICONS: Record<MealSlot, string> = {
  breakfast: '🍳', lunch: '🥗', dinner: '🍽️', snack: '🍎',
}

const SLOT_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }

const TYPE_LABELS: Record<string, string> = {
  main: 'Main plan', side_quest: 'Side quest', reservation: 'Reservation',
}

function ActivitiesSection({ dayId }: { dayId: string }) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
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

  const meals = activities
    .filter((a) => a.type === 'meal')
    .sort((a, b) => (SLOT_ORDER[a.meal_slot ?? ''] ?? 99) - (SLOT_ORDER[b.meal_slot ?? ''] ?? 99))
  const plans = activities.filter((a) => a.type !== 'meal')
  const hasItems = activities.length > 0
  const isFormOpen = showForm || !!editing

  function startEdit(a: Activity) {
    setEditing(a)
    setShowForm(false)
  }

  function startAdd() {
    setEditing(undefined)
    setShowForm(true)
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="section-label mb-0">Plans & Meals</p>
        {!isFormOpen && (
          <button
            onClick={startAdd}
            className="text-xs text-sage hover:text-forest transition-colors"
          >
            + Add
          </button>
        )}
      </div>

      {/* Empty state */}
      {!hasItems && !isFormOpen && (
        <div className="card text-center py-6 space-y-2">
          <p className="text-forest/40 text-sm">Nothing planned yet.</p>
          <button
            onClick={startAdd}
            className="text-xs text-sage hover:text-forest transition-colors"
          >
            + Add a meal or activity
          </button>
        </div>
      )}

      {/* Meals */}
      {meals.length > 0 && (
        <div className="card mb-3 divide-y divide-forest/5">
          {meals.map((meal) =>
            editing?.id === meal.id ? (
              <div key={meal.id} className="py-2">
                <ActivityForm dayId={dayId} initial={editing} onDone={() => setEditing(undefined)} />
              </div>
            ) : (
              <div key={meal.id} className="py-2.5 flex items-start justify-between">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <span className="text-lg mt-0.5 shrink-0">
                    {MEAL_ICONS[meal.meal_slot as MealSlot] ?? '🍽️'}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-forest/40 capitalize">{meal.meal_slot}</span>
                      {meal.is_booked && <span className="text-xs text-sage">✓ Booked</span>}
                    </div>
                    <p className="text-sm font-medium text-forest leading-tight">{meal.name}</p>
                    <div className="flex flex-wrap gap-x-3 mt-0.5">
                      {meal.time && <span className="text-xs text-forest/50">{meal.time.slice(0, 5)}</span>}
                      {meal.address && (
                        <span className="text-xs text-forest/50">{meal.address}</span>
                      )}
                      {meal.estimated_cost != null && (
                        <span className="text-xs text-gold font-mono">${meal.estimated_cost}</span>
                      )}
                    </div>
                    {meal.confirmation_number && (
                      <p className="text-xs text-forest/40 font-mono mt-0.5">#{meal.confirmation_number}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 shrink-0 ml-3">
                  <button
                    onClick={() => startEdit(meal)}
                    className="text-xs text-sage hover:text-forest transition-colors"
                  >Edit</button>
                  <button
                    onClick={() => deleteMutation.mutate(meal.id)}
                    className="text-xs text-terracotta hover:text-forest transition-colors"
                  >✕</button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Other activities */}
      {plans.length > 0 && (
        <div className="card mb-3">
          {plans.map((a) =>
            editing?.id === a.id ? (
              <div key={a.id} className="py-2">
                <ActivityForm dayId={dayId} initial={editing} onDone={() => setEditing(undefined)} />
              </div>
            ) : (
              <div key={a.id} className="flex items-start gap-3 py-2.5 border-b border-forest/5 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-forest/40 uppercase tracking-wide">
                      {TYPE_LABELS[a.type ?? 'main'] ?? a.type}
                    </span>
                    {a.is_booked && <span className="text-xs text-sage font-medium">✓ Booked</span>}
                  </div>
                  <p className="text-sm font-medium text-forest">{a.name}</p>
                  <div className="flex flex-wrap gap-x-3 mt-0.5">
                    {a.time && <span className="text-xs text-forest/50">{a.time.slice(0, 5)}</span>}
                    {a.address && <span className="text-xs text-forest/50">{a.address}</span>}
                    {a.estimated_cost != null && (
                      <span className="text-xs text-gold font-mono">${a.estimated_cost}</span>
                    )}
                  </div>
                  {a.confirmation_number && (
                    <p className="text-xs text-forest/40 font-mono mt-0.5">#{a.confirmation_number}</p>
                  )}
                </div>
                <div className="flex gap-3 shrink-0">
                  <button
                    onClick={() => startEdit(a)}
                    className="text-xs text-sage hover:text-forest transition-colors"
                  >Edit</button>
                  <button
                    onClick={() => deleteMutation.mutate(a.id)}
                    className="text-xs text-terracotta hover:text-forest transition-colors"
                  >✕</button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Add form */}
      {showForm && !editing && (
        <ActivityForm dayId={dayId} onDone={() => setShowForm(false)} />
      )}

      {/* Add another link when items already exist */}
      {hasItems && !isFormOpen && (
        <button
          onClick={startAdd}
          className="text-xs text-sage hover:text-forest transition-colors mt-0.5"
        >
          + Add another
        </button>
      )}
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
              <p className="text-sm font-medium text-forest">{r.title || r.provider || r.type || '—'}</p>
              {r.provider && <p className="text-xs text-forest/50">{r.provider}</p>}
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
                  className="text-xs text-deep-teal underline mt-0.5 block"
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

  // Held here rather than inside DayHeader so the weather card can open the
  // editor straight to the weather-location field when a lookup fails.
  const [editingDay, setEditingDay] = useState(false)
  const [weatherLocOpen, setWeatherLocOpen] = useState(false)

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

  // All days + hotel reservations — for the same wallet-address route fallback
  // the Days list and Route page use, so weather shows even when the route
  // only exists via a hotel reservation. Query keys match DaysPage to share cache.
  const { data: allDays = [] } = useQuery({
    queryKey: ['days', tripId],
    queryFn: async (): Promise<Day[]> => {
      const { data, error } = await supabase
        .from('days').select('*').eq('trip_id', tripId!).order('day_number')
      if (error) throw error
      return data ?? []
    },
    enabled: !!tripId,
  })

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

  // Effective route for the weather card — fall back to wallet hotel addresses
  // when day locations aren't set (same logic as DaysPage / RoutePage).
  const hotelByDate: Record<string, string> = {}
  for (const r of hotelRes) {
    if (r.date && r.address) hotelByDate[r.date] = r.address
  }
  const sortedDays = [...allDays].sort((a, b) => a.day_number - b.day_number)
  const dayIndex = sortedDays.findIndex((d) => d.id === day.id)
  const prevDay = dayIndex > 0 ? sortedDays[dayIndex - 1] : null
  const { from: weatherFrom, to: weatherTo } = weatherLocations(day, prevDay, hotelByDate)

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

      <DayHeader
        day={day}
        editing={editingDay}
        setEditing={setEditingDay}
        weatherLocOpen={weatherLocOpen || !!day.start_weather_location || !!day.end_weather_location}
        setWeatherLocOpen={setWeatherLocOpen}
      />
      <DayWeatherCard
        from={weatherFrom}
        to={weatherTo}
        date={day.date}
        onFixLocation={() => { setEditingDay(true); setWeatherLocOpen(true) }}
      />
      <LodgingSection dayId={day.id} tripId={tripId} date={day.date} />
      <ActivitiesSection dayId={day.id} />
      {day.start_location && day.end_location && day.start_location !== day.end_location && (
        <SuggestStopsSection
          dayId={day.id}
          from={day.start_location}
          to={day.end_location}
          date={day.date}
        />
      )}
      {tripId && <WalletSection tripId={tripId} date={day.date} />}
    </div>
  )
}
