// Per-day weather — Open-Meteo forecast for dates within 16 days, five-year
// historical normals beyond that. No API key on the free (non-commercial)
// tier; base URLs live in env vars so the commercial tier is a config change.

import { useQuery, type QueryClient } from '@tanstack/react-query'
import { geocode, normalizeLocation } from '@/lib/geocoding'

export { normalizeLocation }

const FORECAST_URL =
  import.meta.env.VITE_OPEN_METEO_FORECAST_URL || 'https://api.open-meteo.com/v1/forecast'
const ARCHIVE_URL =
  import.meta.env.VITE_OPEN_METEO_ARCHIVE_URL || 'https://archive-api.open-meteo.com/v1/archive'
const API_KEY = import.meta.env.VITE_OPEN_METEO_API_KEY || ''

export interface WeatherReading {
  tempF: number | null
  rainPct: number | null
  source: 'forecast' | 'normal'
  /**
   * IANA zone for the location, e.g. "America/Denver". Open-Meteo returns it
   * because we ask for timezone=auto; sunrise/sunset needs it to show
   * park-local times. Null when the reading came back empty. Providers other
   * than Open-Meteo's geocoder don't supply one, so this is often the only
   * source of a zone for a street address.
   */
  timeZone: string | null
}

export interface DayWeather {
  morning: WeatherReading
  night: WeatherReading
}

// Sampling: 7 AM at the wake-up location, 9 PM at the bed-down location,
// each in that location's own local time (timezone=auto).
const AM_HOUR = 7
const PM_HOUR = 21
const AM_WINDOW = [6, 7, 8, 9, 10]
const PM_WINDOW = [18, 19, 20, 21, 22, 23]

const FORECAST_DAYS = 16
const CLIMATOLOGY_YEARS = 5
// Archive lags ~5 days behind real time; never request anything newer than this.
const ARCHIVE_LAG_DAYS = 7

type Coords = { lat: number; lon: number }

// ─── which place to ask about ────────────────────────────────────────────────

/** The day fields weatherLocations needs — kept structural so guest pages,
 *  which fetch a narrower row shape, can pass what they have. */
export interface WeatherDay {
  date: string | null
  start_location: string | null
  end_location: string | null
  start_weather_location?: string | null
  end_weather_location?: string | null
}

/**
 * Where to look up each end of a day's weather, in priority order:
 *   1. the manual override (migration 014) — the escape hatch for anywhere the
 *      geocoder chain still can't find
 *   2. the day's own start/end location
 *   3. the relevant hotel address from the wallet
 *
 * Morning uses where you woke up, so it falls back to the PREVIOUS night's
 * hotel; night uses that night's. Shared by the owner day page, the guest day
 * list and the itinerary export, which otherwise drifted apart.
 */
export function weatherLocations(
  day: WeatherDay,
  prevDay: { date: string | null } | null,
  hotelByDate: Record<string, string | null | undefined>
): { from: string | null; to: string | null } {
  const hotel = (d: string | null | undefined) => (d ? hotelByDate[d] ?? null : null)
  return {
    from: day.start_weather_location || day.start_location || hotel(prevDay?.date) || null,
    to: day.end_weather_location || day.end_location || hotel(day.date) || null,
  }
}

// ─── Open-Meteo fetch helpers ────────────────────────────────────────────────

interface HourlyData {
  time: string[]
  temperature_2m: (number | null)[]
  precipitation_probability?: (number | null)[]
  precipitation?: (number | null)[]
}

/** Hourly series plus the location's IANA zone, which timezone=auto returns. */
interface HourlySeries {
  hourly: HourlyData
  timeZone: string | null
}

// Dedupe concurrent identical requests (e.g. a rest day fetching the same
// coordinate for both morning and night).
const fetchInflight = new Map<string, Promise<HourlySeries>>()

async function fetchHourly(url: string): Promise<HourlySeries> {
  const existing = fetchInflight.get(url)
  if (existing) return existing
  const promise = (async () => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
      const data = await res.json()
      if (!data.hourly?.time) throw new Error('Open-Meteo: no hourly data')
      return { hourly: data.hourly as HourlyData, timeZone: (data.timezone as string) ?? null }
    } finally {
      fetchInflight.delete(url)
    }
  })()
  fetchInflight.set(url, promise)
  return promise
}

function withKey(url: string): string {
  return API_KEY ? `${url}&apikey=${API_KEY}` : url
}

function fetchForecast(coords: Coords): Promise<HourlySeries> {
  const url =
    `${FORECAST_URL}?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&hourly=temperature_2m,precipitation_probability&temperature_unit=fahrenheit` +
    `&timezone=auto&forecast_days=${FORECAST_DAYS}`
  return fetchHourly(withKey(url))
}

function fetchArchiveWindow(coords: Coords, startISO: string, endISO: string): Promise<HourlySeries> {
  const url =
    `${ARCHIVE_URL}?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&start_date=${startISO}&end_date=${endISO}` +
    `&hourly=temperature_2m,precipitation&temperature_unit=fahrenheit` +
    `&precipitation_unit=inch&timezone=auto`
  return fetchHourly(withKey(url))
}

// ─── date helpers ────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (new Date(toISO + 'T00:00:00Z').getTime() - new Date(fromISO + 'T00:00:00Z').getTime()) /
      86400000
  )
}

/** Whether a date falls inside Open-Meteo's forecast range as of today. */
export function isForecastable(dateISO: string): boolean {
  const diff = daysBetween(todayISO(), dateISO)
  return diff >= 0 && diff < FORECAST_DAYS
}

function hourIndex(hourly: HourlyData, dateISO: string, hour: number): number | null {
  const i = hourly.time.indexOf(`${dateISO}T${String(hour).padStart(2, '0')}:00`)
  return i === -1 ? null : i
}

// ─── readings ────────────────────────────────────────────────────────────────

function forecastReading(series: HourlySeries, dateISO: string, hour: number, window: number[]): WeatherReading | null {
  const { hourly } = series
  const i = hourIndex(hourly, dateISO, hour)
  if (i === null) return null
  let rain: number | null = null
  for (const h of window) {
    const j = hourIndex(hourly, dateISO, h)
    const p = j === null ? null : hourly.precipitation_probability?.[j] ?? null
    if (p !== null) rain = Math.max(rain ?? 0, p)
  }
  return { tempF: hourly.temperature_2m[i], rainPct: rain, source: 'forecast', timeZone: series.timeZone }
}

// Historical normal: sample the target calendar date ±2 days across the last
// five years at the same coordinate and average. Rain chance = share of
// sampled days with >0.01 in of precipitation in the relevant window.
async function climatologyReading(
  coords: Coords,
  dateISO: string,
  hour: number,
  window: number[]
): Promise<WeatherReading> {
  const targetYear = parseInt(dateISO.slice(0, 4), 10)
  const monthDay = dateISO.slice(4) // "-MM-DD"
  const archiveCutoff = shiftISO(todayISO(), -ARCHIVE_LAG_DAYS)

  const years: number[] = []
  for (let y = targetYear - 1; y >= targetYear - CLIMATOLOGY_YEARS - 1 && years.length < CLIMATOLOGY_YEARS; y--) {
    if (shiftISO(`${y}${monthDay}`, 2) <= archiveCutoff) years.push(y)
  }

  const runs = await Promise.all(
    years.map(async (y) => ({
      year: y,
      series: await fetchArchiveWindow(
        coords,
        shiftISO(`${y}${monthDay}`, -2),
        shiftISO(`${y}${monthDay}`, 2)
      ).catch(() => null),
    }))
  )
  const ok = runs.filter((r): r is { year: number; series: HourlySeries } => r.series !== null)
  if (!ok.length) throw new Error('Historical weather unavailable')

  const temps: number[] = []
  const wet: number[] = []
  ok.forEach(({ year, series }) => {
    const { hourly } = series
    for (let off = -2; off <= 2; off++) {
      const sampleISO = shiftISO(`${year}${monthDay}`, off)
      const i = hourIndex(hourly, sampleISO, hour)
      if (i === null) continue
      const t = hourly.temperature_2m[i]
      if (t !== null) temps.push(t)
      let rained = false
      for (const h of window) {
        const j = hourIndex(hourly, sampleISO, h)
        if (j !== null && (hourly.precipitation?.[j] ?? 0) > 0.01) rained = true
      }
      wet.push(rained ? 1 : 0)
    }
  })

  return {
    tempF: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
    rainPct: wet.length ? (wet.reduce((a, b) => a + b, 0) / wet.length) * 100 : null,
    source: 'normal',
    timeZone: ok[0].series.timeZone,
  }
}

/**
 * One reading (morning or night) for a free-text location on a date.
 *
 * Throws on network failure — including a geocoder that couldn't be reached —
 * so React Query retries with backoff instead of caching a blank forever.
 * Resolves with null fields only when the location genuinely doesn't resolve,
 * which the UI reports differently from an outright error.
 */
export async function getSlotReading(
  location: string,
  dateISO: string,
  slot: 'morning' | 'night'
): Promise<WeatherReading> {
  const hour = slot === 'morning' ? AM_HOUR : PM_HOUR
  const window = slot === 'morning' ? AM_WINDOW : PM_WINDOW
  const emptySource: 'forecast' | 'normal' = isForecastable(dateISO) ? 'forecast' : 'normal'

  const place = await geocode(location)
  if (!place) return { tempF: null, rainPct: null, source: emptySource, timeZone: null }
  const coords: Coords = { lat: place.lat, lon: place.lon }

  if (isForecastable(dateISO)) {
    const reading = forecastReading(await fetchForecast(coords), dateISO, hour, window)
    if (reading) return reading
  }
  return climatologyReading(coords, dateISO, hour, window)
}

/** Full-day weather: morning at the start location, night at the end location. */
export async function getDayWeather(
  startLocation: string,
  endLocation: string,
  dateISO: string
): Promise<DayWeather> {
  const [morning, night] = await Promise.all([
    getSlotReading(startLocation, dateISO, 'morning'),
    getSlotReading(endLocation, dateISO, 'night'),
  ])
  return { morning, night }
}

/**
 * Cache-aware reading for non-hook callers (the itinerary export). Returns the
 * cached reading if one exists — even stale, which is fine for a snapshot —
 * otherwise fetches and seeds the cache. Never throws: offline-and-uncached
 * resolves to null so the export simply omits that day's weather.
 */
export async function getSlotReadingCached(
  queryClient: QueryClient,
  location: string,
  dateISO: string,
  slot: 'morning' | 'night'
): Promise<WeatherReading | null> {
  const key = ['weather', normalizeLocation(location), dateISO, slot]
  const cached = queryClient.getQueryData<WeatherReading>(key)
  if (cached) return cached
  try {
    const fresh = await getSlotReading(location, dateISO, slot)
    queryClient.setQueryData(key, fresh)
    return fresh
  } catch {
    return null
  }
}

// ─── React Query hooks ───────────────────────────────────────────────────────
// Keys include the normalized location string and date so entries are shared
// across days that stop in the same place, and readings persist to IndexedDB
// with the rest of the query cache (works offline in the parks).

const FORECAST_STALE_MS = 1000 * 60 * 60 * 3 // forecasts refresh ~3-hourly

export function useSlotReading(location: string | null, dateISO: string | null, slot: 'morning' | 'night') {
  const enabled = !!location && !!dateISO
  return useQuery({
    queryKey: ['weather', location ? normalizeLocation(location) : '', dateISO, slot],
    queryFn: () => getSlotReading(location!, dateISO!, slot),
    enabled,
    staleTime: enabled && isForecastable(dateISO!) ? FORECAST_STALE_MS : Infinity,
    // Geocode and forecast failures now throw rather than resolving empty, so
    // retries actually fire. Backoff keeps a flaky connection from hammering.
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  })
}

export function useDayWeather(from: string | null, to: string | null, dateISO: string | null) {
  const morning = useSlotReading(from, dateISO, 'morning')
  const night = useSlotReading(to, dateISO, 'night')
  return { morning, night }
}
