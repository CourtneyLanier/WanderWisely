// Branded itinerary + meal-plan export.
//
// Produces a single self-contained HTML document that:
//   • on screen renders as a responsive slideshow (arrow keys + swipe + buttons)
//   • on print paginates one slide per page (browser "Save as PDF")
//
// Branded with the round WanderWisely logo only. Never references 3Strand.

import { supabase } from '@/lib/supabase'
import { getDocFileBlob } from '@/lib/docFiles'
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

export async function gatherExportData(tripId: string, includeFiles = false): Promise<ExportData> {
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

  return {
    trip, days, lodgingByDay, activitiesByDay, reservationsByDate,
    logoDataUri, docFiles, docFilesMissing,
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
  // The logo image is injected once via a CSS rule (see buildExportHtml), so
  // here we only emit a lightweight element that references it by class.
  const logo = data.logoDataUri ? `<span class="brandmark" role="img" aria-label="WanderWisely"></span>` : ''
  return `<div class="brandbar">${logo}<span>WanderWisely</span></div>`
}

function coverSlide(data: ExportData, opts: ExportOptions): string {
  const { trip } = data
  const logo = data.logoDataUri
    ? `<div class="cover-logo" role="img" aria-label="WanderWisely"></div>`
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

function mealLine(m: Activity, opts: ExportOptions): string {
  const icon = SLOT_ICON[m.meal_slot as MealSlot] ?? '🍽️'
  const slot = m.meal_slot ? SLOT_LABEL[m.meal_slot as MealSlot] : 'Meal'
  const bits: string[] = []
  if (m.time) bits.push(esc(fmtTime12(m.time)))
  if (m.address) bits.push(`<a class="maplink" href="${esc(mapsHref(m.address))}">📍 ${esc(m.address)}</a>`)
  if (opts.includePrices && m.estimated_cost != null) bits.push(`<span class="cost">${esc(money(m.estimated_cost))}</span>`)
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
  return `<div class="item">
    <span class="item-icon">${icon}</span>
    <div class="item-body">
      <div class="item-top"><span class="item-slot">${esc(r.type ?? 'Reservation')}</span></div>
      <p class="item-name">${esc(r.title || r.provider || 'Reservation')}</p>
      ${bits.length ? `<div class="item-meta">${bits.join('<span class="dot">·</span>')}</div>` : ''}
    </div>
  </div>`
}

function daySlide(data: ExportData, day: Day, opts: ExportOptions): string {
  const route = (day.start_location || day.end_location)
    ? `${esc(day.start_location || '?')} <span class="arrow">→</span> ${esc(day.end_location || '?')}`
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
.slide-inner{width:100%;max-width:780px;margin:0 auto}
/* Brand bar */
.brandbar{display:flex;align-items:center;gap:8px;margin-bottom:22px;opacity:.75}
.brandmark{width:26px;height:26px;border-radius:50%;display:inline-block;
  background-size:cover;background-position:center;
  box-shadow:0 0 0 1.5px rgba(45,61,30,.15)}
.brandbar span{font-size:12px;font-weight:600;letter-spacing:.12em;
  text-transform:uppercase;color:var(--sage)}
/* Cover */
.cover{align-items:center;justify-content:center;text-align:center}
.cover-inner{max-width:640px}
.cover-logo{width:132px;height:132px;border-radius:50%;background-size:cover;background-position:center;
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
  .controls,.hint,.brandbar span{}
  .no-print{display:none!important}
  body{background:#fff}
  .deck{width:auto}
  .slide{display:flex!important;min-height:auto;overflow:visible;
    page-break-after:always;padding:0.35in 0.5in}
  .slide:last-child{page-break-after:auto}
  .block{break-inside:avoid}
  .print-only{display:block}
  .attach-img{box-shadow:none;max-height:9in}
  .cover{min-height:9in;justify-content:center}
  a{color:var(--forest)}
  @page{margin:0.4in}
}
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

  // Embed the logo once as a shared background image, rather than repeating the
  // data URI on every slide (keeps large trips from bloating to several MB).
  const logoCss = data.logoDataUri
    ? `.brandmark,.cover-logo{background-image:url("${data.logoDataUri}")}`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(data.trip.name)} — ${esc(titleSuffix)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet" />
<style>${STYLES}${logoCss}</style>
</head>
<body>
<div class="deck">${slides.join('\n')}</div>
<div class="hint no-print">← → to navigate</div>
<div class="controls no-print">
  <button id="prev" aria-label="Previous">‹</button>
  <span class="counter" id="counter">1 / 1</span>
  <button id="next" aria-label="Next">›</button>
</div>
<script>${SLIDESHOW_SCRIPT}${hasAttachments ? ATTACH_SCRIPT : ''}${autoPrint ? AUTOPRINT_SCRIPT : ''}</script>
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
export function openPrintWindow(html: string): boolean {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}
