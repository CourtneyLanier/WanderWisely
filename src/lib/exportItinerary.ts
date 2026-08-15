// Branded itinerary + meal-plan export.
//
// Produces a single self-contained HTML document that:
//   • on screen renders as a responsive slideshow (arrow keys + swipe + buttons)
//   • on print paginates one slide per page (browser "Save as PDF")
//
// Branded with the round WanderWisely logo only. Never references 3Strand.

import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getDocFileBlob } from '@/lib/docFiles'
import { dayRoute } from '@/lib/dayTitle'
import { normalizeUrl, displayUrl } from '@/lib/urls'
import { getSlotReadingCached, weatherLocations, type WeatherReading } from '@/lib/weather'
import { geocode } from '@/lib/geocoding'
import { sunTimes, formatInZone, formatDaylight } from '@/lib/sun'
import type { Trip, Day, Lodging, Activity, Reservation, MealSlot, TripDocument } from '@/types'

// ─── Options ─────────────────────────────────────────────────────────────────

/** What to put in the export. */
export type ExportContent = 'itinerary' | 'meal_plan' | 'combined'
/** How the dedicated meal-plan section is organized. */
export type MealStyle = 'by_day' | 'by_type'

export interface ExportOptions {
  content: ExportContent
  mealStyle: MealStyle
  includePrices: boolean
  /** Embed files attached to trip documents (PDFs/images) into the export. */
  includeFiles: boolean
  /** Add morning/night weather to each day slide (snapshot at export time). */
  includeWeather: boolean
}

// ─── Gathered data ───────────────────────────────────────────────────────────

/** A document's attached file, embedded as base64 so the export is self-contained. */
export interface ExportDocFile {
  title: string
  fileName: string
  fileType: string
  fileSize: number
  base64: string
}

/** Weather snapshot for one day slide; either slot may be unavailable. */
export interface ExportDayWeather {
  morning: WeatherReading | null
  night: WeatherReading | null
  /**
   * Sunrise/sunset, already formatted in the location's own timezone. Computed
   * rather than fetched, so these survive a day whose temperature lookups
   * failed — the slide is never completely empty.
   */
  sunrise: string | null
  sunset: string | null
  daylight: string | null
}

export interface ExportData {
  trip: Trip
  days: Day[]
  lodgingByDay: Record<string, Lodging>
  activitiesByDay: Record<string, Activity[]>
  reservationsByDate: Record<string, Reservation[]>
  logoDataUri: string | null
  docFiles: ExportDocFile[]
  /** Titles of attached files that could not be loaded for embedding. */
  docFilesMissing: string[]
  /** Weather snapshots keyed by day id; empty when weather wasn't gathered. */
  weatherByDay: Record<string, ExportDayWeather>
  /** Human-readable date the weather values were captured, e.g. "Aug 8, 2026". */
  weatherAsOf: string | null
}

// ─── Small helpers ───────────────────────────────────────────────────────────

/** HTML-escape a value for safe interpolation into the generated document. */
function esc(v: unknown): string {
  if (v == null) return ''
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtLongDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function fmtDayDate(dateStr: string | null): string {
  if (!dateStr) return 'Date TBD'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
}

/** 'HH:MM[:SS]' → '9:30 AM'. Returns '' for null/empty. */
function fmtTime12(t: string | null): string {
  if (!t) return ''
  const [hStr, mStr] = t.split(':')
  const h = Number(hStr)
  const m = Number(mStr ?? 0)
  if (Number.isNaN(h)) return ''
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

const SLOT_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }
const SLOT_ICON: Record<MealSlot, string> = { breakfast: '🍳', lunch: '🥗', dinner: '🍽️', snack: '🍎' }
const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
}
const RES_ICON: Record<string, string> = {
  flight: '✈️', hotel: '🏨', car: '🚗', restaurant: '🍴', activity: '🎯', other: '📋',
}
const PLAN_TYPE_LABEL: Record<string, string> = {
  main: 'Main plan', side_quest: 'Side quest', reservation: 'Reservation',
}

function money(n: number): string {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function mapsHref(addr: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
}

/** Slugify a trip name for use in a download filename. */
export function safeFileName(name: string): string {
  return (name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'trip').toLowerCase()
}

// ─── Logo → data URI (so the exported file is self-contained) ────────────────

async function loadLogoDataUri(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ─── Data gathering ──────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsDataURL(blob)
  })
}

/** Load every attached document file (local cache first) and base64-encode it. */
async function gatherDocFiles(
  tripId: string
): Promise<{ docFiles: ExportDocFile[]; docFilesMissing: string[] }> {
  const { data, error } = await supabase
    .from('trip_documents')
    .select('*')
    .eq('trip_id', tripId)
    .not('file_path', 'is', null)
    .order('sort_order')
    .order('created_at')
  if (error) throw error

  const docFiles: ExportDocFile[] = []
  const docFilesMissing: string[] = []
  for (const doc of (data ?? []) as TripDocument[]) {
    try {
      const file = await getDocFileBlob(doc)
      docFiles.push({
        title: doc.title,
        fileName: file.name,
        fileType: file.type,
        fileSize: doc.file_size ?? file.blob.size,
        base64: await blobToBase64(file.blob),
      })
    } catch {
      docFilesMissing.push(`${doc.title} (${doc.file_name ?? 'file'})`)
    }
  }
  return { docFiles, docFilesMissing }
}

/**
 * Morning/night weather per day, using the same wallet hotel-address fallback
 * for missing day locations as the Days list and Route page. Reads the app's
 * cached readings first (so a warm cache exports instantly and offline);
 * uncached days fetch live and unreachable ones are simply omitted.
 */
async function gatherWeather(
  queryClient: QueryClient,
  days: Day[],
  reservationsByDate: Record<string, Reservation[]>
): Promise<Record<string, ExportDayWeather>> {
  const hotelAddr = (date: string | null): string | null => {
    if (!date) return null
    return (reservationsByDate[date] ?? []).find((r) => r.type === 'hotel' && r.address)?.address ?? null
  }

  const weatherByDay: Record<string, ExportDayWeather> = {}
  await Promise.all(
    days.map(async (day, i) => {
      const prevDay = i > 0 ? days[i - 1] : null
      const hotelByDate: Record<string, string | null> = {}
      if (prevDay?.date) hotelByDate[prevDay.date] = hotelAddr(prevDay.date)
      if (day.date) hotelByDate[day.date] = hotelAddr(day.date)
      const { from, to } = weatherLocations(day, prevDay, hotelByDate)
      if (!from || !to || !day.date) return
      const [morning, night, fromGeo, toGeo] = await Promise.all([
        getSlotReadingCached(queryClient, from, day.date, 'morning'),
        getSlotReadingCached(queryClient, to, day.date, 'night'),
        geocode(from).catch(() => null),
        geocode(to).catch(() => null),
      ])

      // Sunrise at the wake-up coordinate, sunset at the bed-down one.
      const riseAt = fromGeo && sunTimes(fromGeo.lat, fromGeo.lon, day.date)
      const setAt = toGeo && sunTimes(toGeo.lat, toGeo.lon, day.date)
      const riseZone = fromGeo?.timeZone ?? morning?.timeZone ?? null
      const setZone = toGeo?.timeZone ?? night?.timeZone ?? null

      const entry: ExportDayWeather = {
        morning,
        night,
        sunrise: riseAt ? formatInZone(riseAt.sunrise, riseZone) : null,
        sunset: setAt ? formatInZone(setAt.sunset, setZone) : null,
        // Only meaningful when both ends are the same place; a travel day's
        // "daylight" spanning two locations would be a made-up number.
        daylight: riseAt && setAt && from === to ? formatDaylight(riseAt.daylightMinutes) : null,
      }
      if (morning || night || entry.sunrise || entry.sunset) weatherByDay[day.id] = entry
    })
  )
  return weatherByDay
}

export async function gatherExportData(
  tripId: string,
  includeFiles = false,
  /** Pass the app's QueryClient to include per-day weather snapshots. */
  weatherClient: QueryClient | null = null
): Promise<ExportData> {
  const [tripRes, daysRes, reservationsRes] = await Promise.all([
    supabase.from('trips').select('*').eq('id', tripId).single(),
    supabase.from('days').select('*').eq('trip_id', tripId).order('day_number'),
    supabase.from('reservations').select('*').eq('trip_id', tripId).order('time', { nullsFirst: false }),
  ])
  if (tripRes.error) throw tripRes.error

  const trip = tripRes.data as Trip
  const days: Day[] = daysRes.data ?? []
  const reservations: Reservation[] = reservationsRes.data ?? []
  const dayIds = days.map((d) => d.id)

  const [lodgingRes, activitiesRes] = dayIds.length
    ? await Promise.all([
        supabase.from('lodging').select('*').in('day_id', dayIds),
        supabase.from('activities').select('*').in('day_id', dayIds)
          .order('sort_order').order('time', { nullsFirst: false }),
      ])
    : [{ data: [] as Lodging[] }, { data: [] as Activity[] }]

  const lodgingByDay: Record<string, Lodging> = {}
  for (const l of (lodgingRes.data ?? []) as Lodging[]) lodgingByDay[l.day_id] = l

  const activitiesByDay: Record<string, Activity[]> = {}
  for (const a of (activitiesRes.data ?? []) as Activity[]) {
    ;(activitiesByDay[a.day_id] ??= []).push(a)
  }

  const reservationsByDate: Record<string, Reservation[]> = {}
  for (const r of reservations) {
    if (!r.date) continue
    ;(reservationsByDate[r.date] ??= []).push(r)
  }

  const logoDataUri = await loadLogoDataUri()

  const { docFiles, docFilesMissing } = includeFiles
    ? await gatherDocFiles(tripId)
    : { docFiles: [], docFilesMissing: [] }

  const weatherByDay = weatherClient
    ? await gatherWeather(weatherClient, days, reservationsByDate)
    : {}
  const weatherAsOf = Object.keys(weatherByDay).length
    ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return {
    trip, days, lodgingByDay, activitiesByDay, reservationsByDate,
    logoDataUri, docFiles, docFilesMissing, weatherByDay, weatherAsOf,
  }
}

// ─── Meal helpers ────────────────────────────────────────────────────────────

function mealsForDay(data: ExportData, day: Day): Activity[] {
  return (data.activitiesByDay[day.id] ?? [])
    .filter((a) => a.type === 'meal' && a.name)
    .sort((a, b) => (SLOT_ORDER[a.meal_slot ?? ''] ?? 99) - (SLOT_ORDER[b.meal_slot ?? ''] ?? 99))
}

function plansForDay(data: ExportData, day: Day): Activity[] {
  return (data.activitiesByDay[day.id] ?? []).filter((a) => a.type !== 'meal' && a.name)
}

/** Non-hotel reservations for a day's date (hotels are shown in the lodging block). */
function walletForDay(data: ExportData, day: Day): Reservation[] {
  if (!day.date) return []
  return (data.reservationsByDate[day.date] ?? []).filter((r) => r.type !== 'hotel')
}

// ─── Slide builders (return inner HTML for one <section class="slide">) ──────

function brandbar(data: ExportData): string {
  // Real <img> (not a CSS background) so the logo survives print/Save-as-PDF,
  // where background images are skipped by default. The data URI lives only on
  // the cover slide's <img>; LOGO_SCRIPT copies it into these at load time.
  const logo = data.logoDataUri ? `<img class="brandmark" alt="" />` : ''
  return `<div class="brandbar">${logo}<span>WanderWisely</span></div>`
}

function coverSlide(data: ExportData, opts: ExportOptions): string {
  const { trip } = data
  const logo = data.logoDataUri
    ? `<img class="cover-logo" src="${data.logoDataUri}" alt="WanderWisely" />`
    : `<div class="cover-logo cover-logo--fallback">WW</div>`
  const dates = trip.start_date && trip.end_date
    ? `${fmtLongDate(trip.start_date)} – ${fmtLongDate(trip.end_date)}`
    : trip.start_date ? fmtLongDate(trip.start_date) : ''
  const subtitle = opts.content === 'meal_plan' ? 'Meal Plan'
    : opts.content === 'combined' ? 'Itinerary & Meal Plan'
    : 'Itinerary'
  const dayCount = data.days.length
  return `<section class="slide cover">
    <div class="slide-inner cover-inner">
      ${logo}
      <p class="cover-kicker">${esc(subtitle)}</p>
      <h1>${esc(trip.name)}</h1>
      ${dates ? `<p class="cover-dates">${esc(dates)}</p>` : ''}
      ${dayCount ? `<p class="cover-meta">${dayCount} day${dayCount !== 1 ? 's' : ''}</p>` : ''}
      ${opts.includeWeather && data.weatherAsOf
        ? `<p class="cover-meta">Weather as of ${esc(data.weatherAsOf)}</p>` : ''}
    </div>
  </section>`
}

function lodgingBlock(data: ExportData, day: Day, opts: ExportOptions): string {
  const manual = data.lodgingByDay[day.id]
  const hotelRes = walletDateHotel(data, day)
  if (!manual && !hotelRes) return ''

  const name = manual?.name || hotelRes?.title || hotelRes?.provider || 'Lodging'
  const roomType = manual?.room_type
  const address = manual?.address || hotelRes?.address || ''
  const conf = manual?.confirmation_number || hotelRes?.confirmation_number
  const ci = manual?.check_in_time ? fmtTime12(manual.check_in_time) : ''
  const co = manual?.check_out_time ? fmtTime12(manual.check_out_time) : ''

  const rows: string[] = []
  rows.push(`<div class="block-head">
    <span class="block-icon">🏨</span>
    <span class="block-title">${esc(name)}</span>
    ${roomType ? `<span class="block-sub">${esc(roomType)}</span>` : ''}
  </div>`)

  if (ci || co) {
    rows.push(`<div class="pill-row">
      ${ci ? `<span class="pill"><b>Check-in</b> ${esc(ci)}</span>` : ''}
      ${co ? `<span class="pill"><b>Check-out</b> ${esc(co)}</span>` : ''}
    </div>`)
  }
  const meta: string[] = []
  if (conf) meta.push(`<span class="conf">#${esc(conf)}</span>`)
  if (address) meta.push(`<a class="maplink" href="${esc(mapsHref(address))}">📍 ${esc(address)}</a>`)
  if (meta.length) rows.push(`<div class="meta-row">${meta.join('')}</div>`)

  if (opts.includePrices && (manual?.nightly_rate || manual?.total_cost)) {
    const bits: string[] = []
    if (manual?.nightly_rate) bits.push(`${money(manual.nightly_rate)}/night`)
    if (manual?.total_cost) bits.push(`${money(manual.total_cost)} total`)
    rows.push(`<div class="price-row">${esc(bits.join(' · '))}</div>`)
  }

  return `<div class="block"><p class="block-label">Lodging</p>${rows.join('')}</div>`
}

/** First hotel reservation on the day's date (for the lodging block fallback). */
function walletDateHotel(data: ExportData, day: Day): Reservation | undefined {
  if (!day.date) return undefined
  return (data.reservationsByDate[day.date] ?? []).find((r) => r.type === 'hotel')
}

/**
 * Add an activity's link to a meta row. The printed page shows the FULL URL,
 * minus only the scheme and a leading www., so it can be typed back in from
 * paper — that's the whole point of it being on a printout.
 */
function urlBit(url: string | null, bits: string[]): void {
  const href = normalizeUrl(url)
  if (!href) return
  bits.push(`<a class="urllink" href="${esc(href)}">🔗 ${esc(displayUrl(href))}</a>`)
}

function mealLine(m: Activity, opts: ExportOptions): string {
  const icon = SLOT_ICON[m.meal_slot as MealSlot] ?? '🍽️'
  const slot = m.meal_slot ? SLOT_LABEL[m.meal_slot as MealSlot] : 'Meal'
  const bits: string[] = []
  if (m.time) bits.push(esc(fmtTime12(m.time)))
  if (m.address) bits.push(`<a class="maplink" href="${esc(mapsHref(m.address))}">📍 ${esc(m.address)}</a>`)
  if (opts.includePrices && m.estimated_cost != null) bits.push(`<span class="cost">${esc(money(m.estimated_cost))}</span>`)
  urlBit(m.url, bits)
  return `<div class="item">
    <span class="item-icon">${icon}</span>
    <div class="item-body">
      <div class="item-top"><span class="item-slot">${esc(slot)}</span></div>
      <p class="item-name">${esc(m.name)}</p>
      ${bits.length ? `<div class="item-meta">${bits.join('<span class="dot">·</span>')}</div>` : ''}
    </div>
  </div>`
}

function planLine(a: Activity, opts: ExportOptions): string {
  const label = PLAN_TYPE_LABEL[a.type ?? 'main'] ?? a.type ?? 'Plan'
  const bits: string[] = []
  if (a.time) bits.push(esc(fmtTime12(a.time)))
  if (a.address) bits.push(`<a class="maplink" href="${esc(mapsHref(a.address))}">📍 ${esc(a.address)}</a>`)
  if (a.confirmation_number) bits.push(`<span class="conf">#${esc(a.confirmation_number)}</span>`)
  if (opts.includePrices && a.estimated_cost != null) bits.push(`<span class="cost">${esc(money(a.estimated_cost))}</span>`)
  urlBit(a.url, bits)
  return `<div class="item">
    <span class="item-icon">${a.is_booked ? '✓' : '•'}</span>
    <div class="item-body">
      <div class="item-top"><span class="item-slot">${esc(label)}</span>${a.is_booked ? '<span class="booked">Booked</span>' : ''}</div>
      <p class="item-name">${esc(a.name)}</p>
      ${bits.length ? `<div class="item-meta">${bits.join('<span class="dot">·</span>')}</div>` : ''}
    </div>
  </div>`
}

function walletLine(r: Reservation): string {
  const icon = RES_ICON[r.type ?? 'other'] ?? '📋'
  const bits: string[] = []
  if (r.time) bits.push(esc(fmtTime12(r.time)))
  if (r.confirmation_number) bits.push(`<span class="conf">#${esc(r.confirmation_number)}</span>`)
  if (r.address) bits.push(`<a class="maplink" href="${esc(mapsHref(r.address))}">📍 ${esc(r.address)}</a>`)
  urlBit(r.listing_url, bits)
  return `<div class="item">
    <span class="item-icon">${icon}</span>
    <div class="item-body">
      <div class="item-top"><span class="item-slot">${esc(r.type ?? 'Reservation')}</span></div>
      <p class="item-name">${esc(r.title || r.provider || 'Reservation')}</p>
      ${bits.length ? `<div class="item-meta">${bits.join('<span class="dot">·</span>')}</div>` : ''}
    </div>
  </div>`
}

/** "☀️ 7 AM 54° · 12% rain — 🌙 9 PM 41° · 4% rain" + a source note. */
function weatherLine(data: ExportData, day: Day): string {
  const w = data.weatherByDay[day.id]
  if (!w) return ''

  const slot = (icon: string, label: string, r: WeatherReading | null): string => {
    if (!r || r.tempF === null) return ''
    const rain = r.rainPct !== null ? ` · ${Math.round(r.rainPct)}% rain` : ''
    return `${icon} ${label} ${Math.round(r.tempF)}°${rain}`
  }
  const parts = [slot('☀️', '7 AM', w.morning), slot('🌙', '9 PM', w.night)].filter(Boolean)

  const sun = [
    w.sunrise ? `🌅 ${w.sunrise}` : '',
    w.sunset ? `🌇 ${w.sunset}` : '',
    w.daylight ? `${w.daylight} of daylight` : '',
  ].filter(Boolean)

  if (!parts.length && !sun.length) return ''

  const anyNormal = w.morning?.source === 'normal' || w.night?.source === 'normal'
  const note = anyNormal
    ? 'typical for this date'
    : data.weatherAsOf ? `forecast as of ${data.weatherAsOf}` : ''

  // A day whose readings failed still gets a line, so the layout stays
  // consistent and the gap is visible rather than silently absent.
  const temps = parts.length ? esc(parts.join(' — ')) : '<span class="weather-none">Weather unavailable</span>'

  return `<p class="weather-meta${anyNormal ? ' weather-normal' : ''}">${temps}${
    sun.length ? `<span class="weather-sun">${esc(sun.join(' · '))}</span>` : ''
  }${note && parts.length ? `<span class="weather-note">${esc(note)}</span>` : ''}</p>`
}

function daySlide(data: ExportData, day: Day, opts: ExportOptions): string {
  const { from, to, layover } = dayRoute(day.start_location, day.end_location)
  const route = (from || to)
    ? layover
      ? esc(from)
      : `${esc(from || '?')} <span class="arrow">→</span> ${esc(to || '?')}`
    : '<span class="muted">No route set</span>'

  const driveBits: string[] = []
  if (day.departure_time) driveBits.push(`Leave ${esc(fmtTime12(day.departure_time))}`)
  if (day.drive_miles) driveBits.push(`${esc(day.drive_miles)} mi`)
  if (day.drive_hours) driveBits.push(`${esc(day.drive_hours)} hrs drive`)

  const meals = mealsForDay(data, day)
  const plans = plansForDay(data, day)
  const wallet = walletForDay(data, day)

  const plansBlock = plans.length
    ? `<div class="block"><p class="block-label">Plans</p>${plans.map((a) => planLine(a, opts)).join('')}</div>`
    : ''
  const mealsBlock = meals.length
    ? `<div class="block"><p class="block-label">Meals</p>${meals.map((m) => mealLine(m, opts)).join('')}</div>`
    : ''
  const walletBlock = wallet.length
    ? `<div class="block"><p class="block-label">Reservations</p>${wallet.map(walletLine).join('')}</div>`
    : ''
  const notesBlock = day.notes
    ? `<div class="block notes"><p class="block-label">Notes</p><p class="notes-text">${esc(day.notes)}</p></div>`
    : ''

  return `<section class="slide day">
    ${brandbar(data)}
    <div class="slide-inner">
      <div class="day-head">
        <span class="day-badge">Day ${esc(day.day_number)}</span>
        <span class="day-date">${esc(fmtDayDate(day.date))}</span>
      </div>
      <p class="route">${route}</p>
      ${driveBits.length ? `<p class="drive-meta">${esc(driveBits.join(' · '))}</p>` : ''}
      ${opts.includeWeather ? weatherLine(data, day) : ''}
      ${lodgingBlock(data, day, opts)}
      ${plansBlock}
      ${mealsBlock}
      ${walletBlock}
      ${notesBlock}
    </div>
  </section>`
}

// ─── Meal-plan slides ────────────────────────────────────────────────────────

function mealPlanByDaySlides(data: ExportData, opts: ExportOptions): string {
  const slides: string[] = []
  for (const day of data.days) {
    const meals = mealsForDay(data, day)
    if (!meals.length) continue
    slides.push(`<section class="slide mealplan">
      ${brandbar(data)}
      <div class="slide-inner">
        <div class="day-head">
          <span class="day-badge">Day ${esc(day.day_number)} · Meals</span>
          <span class="day-date">${esc(fmtDayDate(day.date))}</span>
        </div>
        <div class="block">${meals.map((m) => mealLine(m, opts)).join('')}</div>
      </div>
    </section>`)
  }
  if (!slides.length) {
    slides.push(emptyMealSlide(data))
  }
  return slides.join('')
}

function mealPlanByTypeSlides(data: ExportData, opts: ExportOptions): string {
  // Collect meals per slot across the whole trip, tagged with their day.
  const bySlot: Record<MealSlot, { day: Day; meal: Activity }[]> = {
    breakfast: [], lunch: [], dinner: [], snack: [],
  }
  for (const day of data.days) {
    for (const meal of mealsForDay(data, day)) {
      const slot = meal.meal_slot as MealSlot | null
      if (slot && bySlot[slot]) bySlot[slot].push({ day, meal })
    }
  }

  const order: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']
  const slides: string[] = []
  for (const slot of order) {
    const entries = bySlot[slot]
    if (!entries.length) continue
    const items = entries.map(({ day, meal }) => {
      const bits: string[] = []
      if (meal.time) bits.push(esc(fmtTime12(meal.time)))
      if (meal.address) bits.push(`<a class="maplink" href="${esc(mapsHref(meal.address))}">📍 ${esc(meal.address)}</a>`)
      if (opts.includePrices && meal.estimated_cost != null) bits.push(`<span class="cost">${esc(money(meal.estimated_cost))}</span>`)
      return `<div class="item">
        <span class="item-icon">${SLOT_ICON[slot]}</span>
        <div class="item-body">
          <div class="item-top"><span class="item-slot">Day ${esc(day.day_number)} · ${esc(fmtDayDate(day.date))}</span></div>
          <p class="item-name">${esc(meal.name)}</p>
          ${bits.length ? `<div class="item-meta">${bits.join('<span class="dot">·</span>')}</div>` : ''}
        </div>
      </div>`
    }).join('')
    slides.push(`<section class="slide mealplan">
      ${brandbar(data)}
      <div class="slide-inner">
        <div class="day-head"><span class="day-badge">${SLOT_ICON[slot]} ${esc(SLOT_LABEL[slot])}</span></div>
        <div class="block">${items}</div>
      </div>
    </section>`)
  }
  if (!slides.length) slides.push(emptyMealSlide(data))
  return slides.join('')
}

function emptyMealSlide(data: ExportData): string {
  return `<section class="slide mealplan">
    ${brandbar(data)}
    <div class="slide-inner">
      <div class="day-head"><span class="day-badge">Meal Plan</span></div>
      <div class="block"><p class="muted">No meals added yet. Add meals to your days to see them here.</p></div>
    </div>
  </section>`
}

// ─── Attached-file slides ────────────────────────────────────────────────────

function fmtFileSize(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Slides for files attached to trip documents. Images get a full slide each
 * (they print too). PDFs are embedded as base64 and listed on one slide with
 * tap-to-open links — everything travels inside this single HTML file, so it
 * all works with no signal.
 */
function attachmentSlides(data: ExportData): string {
  const images = data.docFiles.filter((f) => f.fileType.startsWith('image/'))
  const pdfs = data.docFiles.filter((f) => f.fileType === 'application/pdf')
  const slides: string[] = []

  for (const img of images) {
    slides.push(`<section class="slide attachment">
      ${brandbar(data)}
      <div class="slide-inner">
        <div class="day-head">
          <span class="day-badge">📎 Attached</span>
          <span class="day-date">${esc(img.title)}</span>
        </div>
        <img class="attach-img" src="data:${esc(img.fileType)};base64,${img.base64}" alt="${esc(img.title)}" />
      </div>
    </section>`)
  }

  if (pdfs.length || data.docFilesMissing.length) {
    const items = pdfs.map((f) => `<div class="item">
      <span class="item-icon">📕</span>
      <div class="item-body">
        <div class="item-top"><span class="item-slot">PDF · ${esc(fmtFileSize(f.fileSize))}</span></div>
        <p class="item-name">${esc(f.title)}</p>
        <div class="item-meta"><span>${esc(f.fileName)}</span></div>
      </div>
      <a class="attach-btn no-print" data-embed download="${esc(f.fileName)}" href="data:application/pdf;base64,${f.base64}">Open</a>
    </div>`).join('')

    const missing = data.docFilesMissing.length
      ? `<p class="attach-missing">Couldn't be included: ${esc(data.docFilesMissing.join(', '))}. Open them once in the app while online, then export again.</p>`
      : ''

    slides.push(`<section class="slide attachments">
      ${brandbar(data)}
      <div class="slide-inner">
        <div class="day-head"><span class="day-badge">📎 Attached documents</span></div>
        ${pdfs.length ? `<div class="block">${items}</div>
        <p class="attach-note no-print">These PDFs are stored inside this file — tap Open to view or save them, even with no signal.</p>
        <p class="attach-note print-only">PDF attachments travel inside the HTML version of this export — open it in a browser to view them.</p>` : ''}
        ${missing}
      </div>
    </section>`)
  }

  return slides.join('')
}

// Turns each embedded data: link into a blob: URL at load time — data: links
// are blocked as top-frame navigations in some browsers (e.g. Chrome), while
// blob: links open/download reliably. Base64 never contains '<', so embedding
// it in markup/script is safe.
const ATTACH_SCRIPT = `
(function(){
  [].slice.call(document.querySelectorAll('a[data-embed]')).forEach(function(a){
    try{
      var href=a.getAttribute('href')||'';
      var comma=href.indexOf('base64,');
      if(href.indexOf('data:')!==0||comma<0)return;
      var type=href.slice(5,href.indexOf(';'));
      var bin=atob(href.slice(comma+7));
      var arr=new Uint8Array(bin.length);
      for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
      a.href=URL.createObjectURL(new Blob([arr],{type:type}));
    }catch(e){}
  });
})();
`

// ─── Document assembly ───────────────────────────────────────────────────────

// Compact layout used when printing — tighter than the screen styles so a full
// day fits on one page. Emitted twice: once inside @media print, and once under
// body.print-sim so FIT_SCRIPT can measure print-layout heights on screen.
const printCompact = (p: string) => `
${p} .slide{padding:0.3in 0.45in}
${p} .slide-inner{zoom:var(--fitzoom,1)}
${p} .brandbar{margin-bottom:10px}
${p} .day-head{margin-bottom:4px}
${p} .route{font-size:22px}
${p} .drive-meta{font-size:11px;margin-top:3px}
${p} .weather-meta{font-size:11px;margin-top:3px}
${p} .weather-note{font-size:10px}
${p} .weather-sun{font-size:10px;margin-top:1px}
${p} .block{padding:9px 12px;margin-top:9px;border-radius:10px;box-shadow:none}
${p} .block-label{margin-bottom:5px}
${p} .block-title{font-size:14px}
${p} .block-sub{font-size:11px}
${p} .item{padding:4px 0}
${p} .item-icon{font-size:14px}
${p} .item-name{font-size:13px}
${p} .item-meta{font-size:11px;margin-top:2px}
${p} .urllink{font-size:10px;margin-top:1px}
${p} .pill-row{gap:6px;margin-top:6px}
${p} .pill{padding:3px 9px;font-size:11px}
${p} .meta-row{margin-top:6px}
${p} .price-row{margin-top:6px;font-size:11px}
${p} .conf{font-size:10px}
${p} .maplink{font-size:11px}
${p} .cost{font-size:11px}
${p} .notes-text{font-size:12px}
`

const STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --cream:#F5EDD6;--forest:#2D3D1E;--sage:#5C7A3E;--gold:#D4943A;
  --terracotta:#8B4A35;--deep-teal:#2D5A3D;--white-warm:#FDF9F3;
}
html,body{height:100%}
body{
  font-family:'DM Sans',system-ui,-apple-system,sans-serif;
  background:var(--cream);color:var(--forest);
  -webkit-font-smoothing:antialiased;line-height:1.4;
}
h1,h2,h3{font-family:'Playfair Display',Georgia,serif;font-weight:600}
a{color:var(--deep-teal);text-decoration:none}
.deck{width:100%}
.slide{
  display:none;min-height:100vh;padding:clamp(22px,5vw,56px);
  flex-direction:column;justify-content:flex-start;
  overflow-y:auto;position:relative;
}
.slide.active{display:flex}
.slide-inner{width:100%;max-width:780px;margin:0 auto;overflow-wrap:anywhere}
/* Brand bar */
.brandbar{display:flex;align-items:center;gap:8px;margin-bottom:22px;opacity:.75}
.brandmark{width:26px;height:26px;border-radius:50%;object-fit:cover;
  box-shadow:0 0 0 1.5px rgba(45,61,30,.15)}
.brandmark:not([src]){visibility:hidden}
.brandbar span{font-size:12px;font-weight:600;letter-spacing:.12em;
  text-transform:uppercase;color:var(--sage)}
/* Cover */
.cover{align-items:center;justify-content:center;text-align:center}
.cover-inner{max-width:640px}
.cover-logo{width:132px;height:132px;border-radius:50%;object-fit:cover;
  margin:0 auto 26px;display:block;box-shadow:0 6px 24px rgba(45,61,30,.18),0 0 0 3px rgba(212,148,58,.35)}
.cover-logo--fallback{display:flex;align-items:center;justify-content:center;
  background:var(--deep-teal);color:#fff;font-family:'Playfair Display',serif;font-size:44px}
.cover-kicker{font-size:13px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;
  color:var(--gold);margin-bottom:12px}
.cover h1{font-size:clamp(30px,6.5vw,54px);color:var(--forest);line-height:1.08}
.cover-dates{margin-top:16px;font-size:clamp(15px,2.6vw,20px);color:var(--sage);font-weight:500}
.cover-meta{margin-top:6px;font-size:14px;color:rgba(45,61,30,.5)}
/* Day head */
.day-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px}
.day-badge{background:rgba(45,90,61,.1);color:var(--deep-teal);font-weight:600;
  font-size:13px;padding:5px 12px;border-radius:7px;letter-spacing:.04em}
.day-date{color:rgba(45,61,30,.55);font-size:14px}
.route{font-family:'Playfair Display',Georgia,serif;font-size:clamp(22px,4.4vw,34px);
  color:var(--forest);line-height:1.14;margin-top:6px}
.route .arrow{color:var(--gold);margin:0 6px}
.drive-meta{color:rgba(45,61,30,.5);font-size:13px;margin-top:6px}
.weather-meta{color:rgba(45,61,30,.65);font-size:13px;margin-top:6px}
.weather-meta.weather-normal{color:rgba(45,61,30,.45)}
.weather-note{font-size:11px;font-style:italic;color:rgba(45,61,30,.4);margin-left:8px}
/* Sun times sit on their own line so a long day never reflows the meta row. */
.weather-sun{display:block;font-size:12px;color:rgba(45,61,30,.5);margin-top:2px}
.weather-none{font-style:italic;color:rgba(45,61,30,.4)}
/* Screen-only: which days had to shrink hardest, shown before you print
   rather than discovered as a stray second page after. */
.fitwarn{display:none;position:fixed;left:12px;bottom:12px;max-width:min(420px,calc(100vw - 24px));
  background:#FFF8E7;border:1px solid rgba(198,146,50,.45);border-radius:10px;
  padding:10px 12px;font-size:12px;line-height:1.45;color:#5A4A21;
  box-shadow:0 4px 14px rgba(0,0,0,.12);z-index:50}
.fitwarn-hint{color:rgba(90,74,33,.7)}
.muted{color:rgba(45,61,30,.4);font-style:italic}
/* Blocks */
.block{background:var(--white-warm);border:1px solid rgba(45,61,30,.11);border-radius:14px;
  padding:16px 18px;margin-top:16px;box-shadow:0 1px 3px rgba(45,61,30,.07)}
.block.notes{background:rgba(92,122,62,.07)}
.block-label{font-size:10px;text-transform:uppercase;letter-spacing:.16em;
  color:rgba(45,61,30,.45);font-weight:600;margin-bottom:10px}
.block-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.block-icon{font-size:18px}
.block-title{font-weight:600;font-size:16px;color:var(--forest)}
.block-sub{font-size:12px;color:rgba(45,61,30,.55)}
.pill-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.pill{background:var(--cream);border-radius:8px;padding:6px 12px;font-size:13px}
.pill b{font-weight:600;color:rgba(45,61,30,.5);font-size:10px;text-transform:uppercase;
  letter-spacing:.08em;margin-right:6px}
.meta-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:10px}
.meta-row>*{min-width:0;max-width:100%}
.price-row{margin-top:10px;font-family:'DM Mono',monospace;font-size:13px;color:var(--gold)}
.conf{font-family:'DM Mono',monospace;font-size:12px;color:var(--deep-teal);
  background:rgba(45,90,61,.08);border-radius:5px;padding:3px 7px}
.maplink{font-size:13px;color:var(--deep-teal)}
.cost{font-family:'DM Mono',monospace;font-size:13px;color:var(--gold)}
/* Items */
.item{display:flex;gap:12px;padding:10px 0;border-top:1px solid rgba(45,61,30,.06)}
.item:first-child{border-top:0;padding-top:2px}
.item-icon{font-size:17px;flex:0 0 auto;width:22px;text-align:center;line-height:1.5}
.item-body{min-width:0;flex:1}
.item-top{display:flex;align-items:center;gap:8px}
.item-slot{font-size:10px;text-transform:uppercase;letter-spacing:.08em;
  color:rgba(45,61,30,.45);font-weight:600}
.booked{font-size:11px;color:var(--sage);font-weight:600}
.item-name{font-weight:500;font-size:15px;color:var(--forest);margin-top:1px}
.item-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px;
  font-size:13px;color:rgba(45,61,30,.6)}
.item-meta>*{min-width:0;max-width:100%}
/* A full URL is one long unbreakable token. Without overflow-wrap it forces
   horizontal overflow, which FIT_SCRIPT then tries to solve by shrinking the
   entire page. Own line, last, so it costs a line instead of reflowing the row. */
.urllink{display:block;width:100%;font-size:11px;margin-top:2px;
  overflow-wrap:anywhere;word-break:break-word;color:rgba(45,61,30,.55)}
.item-meta .dot{color:rgba(45,61,30,.3)}
.notes-text{font-size:14px;color:rgba(45,61,30,.7);font-style:italic;white-space:pre-wrap}
/* Attached files */
.attach-img{display:block;max-width:100%;height:auto;margin-top:16px;border-radius:14px;
  box-shadow:0 2px 10px rgba(45,61,30,.18)}
.attach-btn{align-self:center;flex:0 0 auto;background:var(--deep-teal);color:#fff;
  font-size:13px;font-weight:600;border-radius:9px;padding:8px 16px;
  box-shadow:0 1px 4px rgba(45,61,30,.25)}
.attach-btn:active{background:var(--forest)}
.attach-note{margin-top:12px;font-size:12px;color:rgba(45,61,30,.5)}
.attach-missing{margin-top:12px;font-size:12px;color:var(--terracotta)}
.print-only{display:none}
/* Slideshow controls */
.controls{position:fixed;bottom:0;left:0;right:0;display:flex;align-items:center;
  justify-content:center;gap:20px;padding:14px;
  background:linear-gradient(to top,rgba(45,61,30,.14),transparent);z-index:50}
.controls button{width:46px;height:46px;border-radius:50%;border:0;cursor:pointer;
  background:var(--deep-teal);color:#fff;font-size:22px;line-height:1;
  box-shadow:0 2px 8px rgba(45,61,30,.3);transition:transform .1s,background .15s}
.controls button:hover{background:var(--forest)}
.controls button:active{transform:scale(.92)}
.controls button:disabled{opacity:.35;cursor:default}
.counter{font-size:13px;font-weight:600;color:var(--forest);
  background:var(--white-warm);border-radius:20px;padding:8px 16px;
  box-shadow:0 1px 4px rgba(45,61,30,.15)}
.hint{position:fixed;top:14px;right:16px;font-size:11px;color:rgba(45,61,30,.4);z-index:50}
/* Print — one slide per page */
@media print{
  .no-print{display:none!important}
  body{background:#fff}
  .deck{width:auto}
  .slide{display:flex!important;min-height:auto;overflow:visible;
    page-break-after:always}
  .slide:last-child{page-break-after:auto}
  .block{break-inside:avoid}
  .print-only{display:block}
  .attach-img{box-shadow:none;max-height:9in}
  .cover-logo,.brandmark{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .cover{min-height:9in;justify-content:center}
  a{color:var(--forest)}
  ${printCompact('')}
  @page{margin:0.4in}
}
/* Off-screen print simulation — FIT_SCRIPT toggles this to measure overflow */
body.print-sim .deck{position:absolute;left:-9999px;top:0;width:7.4in}
body.print-sim .slide{display:flex!important;min-height:0;overflow:visible}
${printCompact('body.print-sim')}
`

const SLIDESHOW_SCRIPT = `
(function(){
  var slides=[].slice.call(document.querySelectorAll('.slide'));
  if(!slides.length)return;
  var i=0,counter=document.getElementById('counter'),
      prev=document.getElementById('prev'),next=document.getElementById('next');
  function show(n){
    i=Math.max(0,Math.min(slides.length-1,n));
    slides.forEach(function(s,idx){s.classList.toggle('active',idx===i)});
    if(counter)counter.textContent=(i+1)+' / '+slides.length;
    if(prev)prev.disabled=(i===0);
    if(next)next.disabled=(i===slides.length-1);
    window.scrollTo(0,0);
  }
  if(prev)prev.onclick=function(){show(i-1)};
  if(next)next.onclick=function(){show(i+1)};
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){e.preventDefault();show(i+1)}
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();show(i-1)}
    else if(e.key==='Home'){show(0)} else if(e.key==='End'){show(slides.length-1)}
  });
  var x0=null,y0=null;
  document.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;y0=e.touches[0].clientY},{passive:true});
  document.addEventListener('touchend',function(e){
    if(x0===null)return;
    var dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;
    if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)){show(dx<0?i+1:i-1)}
    x0=null;y0=null;
  },{passive:true});
  show(0);
})();
`

// The logo's data URI is embedded exactly once, on the cover slide's <img>;
// this copies it into every per-slide brandmark so large trips don't repeat
// a ~250KB URI on each slide. Runs before AUTOPRINT_SCRIPT's print call.
const LOGO_SCRIPT = `
(function(){
  var c=document.querySelector('img.cover-logo');
  if(!c)return;
  [].slice.call(document.querySelectorAll('img.brandmark')).forEach(function(m){m.src=c.src});
})();
`

// Guarantees each content slide fits on one printed page. Right before print,
// the deck is laid out off-screen with the print styles (body.print-sim), each
// slide is measured, and any that would spill onto a second page gets its
// content shrunk via the --fitzoom variable (floored at 0.5 for readability).
// The cover and full-page image slides are excluded — CSS already caps them.
// Runs on beforeprint, so it covers both the auto-print path and manual Ctrl+P.
const FIT_SCRIPT = `
(function(){
  var PAGE_H=974; /* 10.15in at 96dpi — inside Letter and A4 with 0.4in margins */
  var FLOOR=0.5;  /* below this it's unreadable in a notebook */
  var WARN=0.55;  /* close enough to the floor to be worth flagging */

  /* zoom is non-standard: Chrome/Safari/Edge fine, Firefox only from v126.
     Without a fallback the fit logic is a silent no-op and every page spills. */
  var useZoom = window.CSS && CSS.supports && CSS.supports('zoom','0.5');

  function apply(s,z){
    if(useZoom){ s.style.setProperty('--fitzoom',z.toFixed(3)); return }
    var inner=s.querySelector('.slide-inner');
    if(!inner)return;
    /* Clear first: scale() doesn't reflow, so the explicit height set on the
       previous iteration would otherwise be measured as the natural one and
       the scale would compound. */
    inner.style.transform='';
    inner.style.height='';
    var natural=inner.scrollHeight;
    inner.style.transformOrigin='top left';
    inner.style.transform='scale('+z.toFixed(3)+')';
    inner.style.height=(natural*z)+'px';
  }
  function reset(s){
    s.style.removeProperty('--fitzoom');
    var inner=s.querySelector('.slide-inner');
    if(inner){inner.style.transform='';inner.style.height=''}
  }

  var tight=[];
  function fit(){
    tight=[];
    document.body.classList.add('print-sim');
    [].slice.call(document.querySelectorAll('.slide')).forEach(function(s){
      if(s.classList.contains('cover')||s.classList.contains('attachment'))return;
      reset(s);
      var h=s.scrollHeight,z=1;
      /* 6 iterations rather than 4 — they're cheap and dense pages converge slowly. */
      for(var k=0;k<6&&h>PAGE_H&&z>FLOOR;k++){
        z=Math.max(FLOOR,z*PAGE_H/h*0.985);
        apply(s,z);
        h=s.scrollHeight;
      }
      if(z<=WARN){
        var t=s.querySelector('.slide-title,h2,h1');
        tight.push({label:(t&&t.textContent||'').trim()||'A day',floored:h>PAGE_H});
      }
    });
    document.body.classList.remove('print-sim');
    report();
  }

  /* Screen-only notice (see .fitwarn in the print stylesheet) so a day that had
     to shrink past the floor is visible BEFORE you send it to paper, rather
     than discovered as a stray second page afterwards. */
  function report(){
    var box=document.getElementById('fitwarn');
    if(!box)return;
    if(!tight.length){box.style.display='none';return}
    var spill=tight.filter(function(t){return t.floored});
    box.style.display='block';
    box.innerHTML='<strong>'+(spill.length?'May print onto a second page':'Tight fit when printed')+
      '</strong><br>'+tight.map(function(t){return t.label}).join(' · ')+
      '<br><span class="fitwarn-hint">Trim a plan, a meal, or the longest links on '+
      (tight.length>1?'these days':'this day')+' to keep one page each.</span>';
  }

  window.addEventListener('beforeprint',fit);
  var mq=window.matchMedia&&window.matchMedia('print');
  if(mq&&mq.addListener)mq.addListener(function(m){if(m.matches)fit()});

  /* Also fit once on load. iOS Safari has no window.print(), so the Share →
     Print path may never fire beforeprint; baking the zoom in up front means
     the paper output is right either way. Cheap, and it's what powers the
     warning above. */
  if(document.readyState==='complete')setTimeout(fit,0);
  else window.addEventListener('load',function(){setTimeout(fit,0)});
})();
`

const AUTOPRINT_SCRIPT = `
(function(){
  function go(){setTimeout(function(){window.print()},250)}
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go)}
  else{window.addEventListener('load',function(){setTimeout(go,500)})}
})();
`

/**
 * Build the complete self-contained export document.
 * @param autoPrint when true, embeds a script that opens the print dialog once
 *        fonts are ready (used by the PDF path).
 */
export function buildExportHtml(data: ExportData, opts: ExportOptions, autoPrint = false): string {
  const slides: string[] = [coverSlide(data, opts)]

  if (opts.content === 'itinerary' || opts.content === 'combined') {
    for (const day of data.days) slides.push(daySlide(data, day, opts))
  }
  if (opts.content === 'meal_plan' || opts.content === 'combined') {
    slides.push(opts.mealStyle === 'by_type'
      ? mealPlanByTypeSlides(data, opts)
      : mealPlanByDaySlides(data, opts))
  }
  const hasAttachments =
    opts.includeFiles && (data.docFiles.length > 0 || data.docFilesMissing.length > 0)
  if (hasAttachments) slides.push(attachmentSlides(data))

  const titleSuffix = opts.content === 'meal_plan' ? 'Meal Plan'
    : opts.content === 'combined' ? 'Itinerary & Meal Plan' : 'Itinerary'

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(data.trip.name)} — ${esc(titleSuffix)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet" />
<style>${STYLES}</style>
</head>
<body>
<div class="deck">${slides.join('\n')}</div>
<div id="fitwarn" class="fitwarn no-print"></div>
<div class="hint no-print">← → to navigate</div>
<div class="controls no-print">
  <button id="prev" aria-label="Previous">‹</button>
  <span class="counter" id="counter">1 / 1</span>
  <button id="next" aria-label="Next">›</button>
</div>
<script>${SLIDESHOW_SCRIPT}${data.logoDataUri ? LOGO_SCRIPT : ''}${hasAttachments ? ATTACH_SCRIPT : ''}${FIT_SCRIPT}${autoPrint ? AUTOPRINT_SCRIPT : ''}</script>
</body>
</html>`
}

// ─── Delivery ────────────────────────────────────────────────────────────────

/** Trigger a browser download of the HTML slideshow file. */
export function downloadHtml(html: string, fileName: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Open the export in a new window and trigger the print dialog (Save as PDF).
 * Returns false if a popup blocker prevented the window from opening.
 */
/**
 * iOS Safari has no window.print(), so the print-window path is a silent
 * no-op there — the button appears to do nothing. Covers the iPadOS
 * desktop-mode case too, where the UA claims Macintosh but touch points give
 * it away.
 *
 * NOT verified on hardware: this project's only test device is Android. The
 * fallback is a download plus instructions, which is strictly better than a
 * dead button either way.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  if (/iP(hone|ad|od)/.test(navigator.userAgent)) return true
  return navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)
}

export function openPrintWindow(html: string): boolean {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}
