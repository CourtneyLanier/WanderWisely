// Free-text location → coordinates, with the timezone when we can get it.
//
// Nominatim used to be the only provider, and it is the wrong primary for a US
// road-trip app: OpenStreetMap's US address coverage is volunteer-contributed
// and thin outside city limits, so rural lodging, trailheads and county-road
// addresses simply return zero results. That is not a rate limit and no amount
// of string cleanup fixes it — the data isn't there. `2128 Lanier Rd Plant City
// FL 33565` fails at every street-level variant and resolves instantly against
// the US Census geocoder.
//
// Three providers, first hit wins:
//   ① US Census    — US street addresses (TIGER ranges). Via the edge function:
//                    Census sends no CORS headers at all.
//   ② Open-Meteo   — place names worldwide. Called directly (ACAO: *), and the
//                    only provider that hands back the IANA timezone.
//   ③ Nominatim    — last resort, non-US and anything the first two miss. Via
//                    the edge function so we can send the identifying
//                    User-Agent its usage policy asks for.
//
// Behind that, a cascade of progressively coarser query forms (§1c): for
// weather purposes a 20-mile miss is irrelevant, so coarsening costs nothing
// and removes almost all of the blanks.

import { useQuery } from '@tanstack/react-query'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { supabase } from '@/lib/supabase'
import { ALL_STATES } from '@/lib/usStates'

export interface GeoResult {
  lat: number
  lon: number
  /** IANA zone, e.g. "America/Denver". Only Open-Meteo returns one. */
  timeZone: string | null
  /** What actually resolved — shown to the user when it isn't the input. */
  matched: string
  source: 'census' | 'open-meteo' | 'nominatim'
  /** True when only a coarsened form resolved, so callers can label it. */
  approximate: boolean
}

/** Thrown for upstream failures — never for "this place doesn't exist". */
export class GeocodeError extends Error {}

export function normalizeLocation(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// ─── cache ───────────────────────────────────────────────────────────────────
// Keyed on the ORIGINAL string, so the cascade runs once per location rather
// than once per render. v2 because v1 stored bare {lat, lon} with no timezone.

const CACHE_PREFIX = 'geo:v2:'
const LEGACY_PREFIX = 'geocode:'

/** Failures are remembered briefly, not for the life of the tab. */
const NEGATIVE_TTL_MS = 10 * 60 * 1000
const failedAt = new Map<string, number>()

const inflight = new Map<string, Promise<GeoResult | null>>()

// ─── query-form cascade ──────────────────────────────────────────────────────

const STREET_SUFFIX =
  /\b(rd|road|st|street|ave|avenue|blvd|boulevard|ln|lane|dr|drive|hwy|highway|way|ct|court|pl|place|ter|terrace|cir|circle|pkwy|parkway|trl|trail)\b/i

const DIRECTIONAL = /^(n|s|e|w|ne|nw|se|sw)$/i

const STATE_ABBRS = new Set(ALL_STATES.map((s) => s.abbr))
const STATE_NAMES = new Map(ALL_STATES.map((s) => [s.name.toLowerCase(), s.abbr]))

/** Worth asking Census: it only knows US street addresses. */
export function looksLikeUsAddress(q: string): boolean {
  if (/^\s*\d+\s+\S/.test(q)) return true // leading house number
  if (STREET_SUFFIX.test(q)) return true
  if (/\b\d{5}(-\d{4})?\s*$/.test(q)) return true // trailing ZIP
  const last = q.trim().split(/[\s,]+/).pop() ?? ''
  return STATE_ABBRS.has(last.toUpperCase())
}

function stripPostcode(q: string): string {
  return q.replace(/\s*\b\d{5}(-\d{4})?\b\s*$/, '').replace(/[\s,]+$/, '')
}

function stripHouseNumber(q: string): string {
  return q.replace(/^\s*\d+\s+/, '')
}

// NOTE: deliberately no NM → National Monument. NM is also New Mexico, and
// mangling every New Mexico address to chase a handful of monuments is a bad
// trade — those resolve as place names through Open-Meteo anyway.
const ABBREVIATIONS: [RegExp, string][] = [
  [/\bNP\b/g, 'National Park'],
  [/\bSP\b/g, 'State Park'],
  [/\bNF\b/g, 'National Forest'],
  [/\bNHP\b/g, 'National Historical Park'],
  [/\bNRA\b/g, 'National Recreation Area'],
  [/\bRd\b/g, 'Road'],
  [/\bHwy\b/g, 'Highway'],
]

function expandAbbreviations(q: string): string {
  return ABBREVIATIONS.reduce((s, [re, full]) => s.replace(re, full), q)
}

function dropFirstSegment(q: string): string {
  const i = q.indexOf(',')
  return i === -1 ? q : q.slice(i + 1).trim()
}

/**
 * City + state, found by anchoring on the state rather than splitting commas —
 * real stored values often have no commas at all, and city names run one to
 * three words so counting tokens from the end doesn't work.
 *
 * `2128 Lanier Rd Plant City FL 33565` → `Plant City, FL`
 */
export function cityStateOf(q: string): string | null {
  const tokens = stripPostcode(q).replace(/,/g, ' ').split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return null

  let stateIdx = -1
  let abbr = ''
  for (let i = tokens.length - 1; i >= 0; i--) {
    const up = tokens[i].toUpperCase()
    if (STATE_ABBRS.has(up)) { stateIdx = i; abbr = up; break }
    const twoWord = `${tokens[i - 1] ?? ''} ${tokens[i]}`.toLowerCase()
    if (STATE_NAMES.has(twoWord)) { stateIdx = i - 1; abbr = STATE_NAMES.get(twoWord)!; break }
    if (STATE_NAMES.has(tokens[i].toLowerCase())) {
      stateIdx = i; abbr = STATE_NAMES.get(tokens[i].toLowerCase())!; break
    }
  }
  if (stateIdx <= 0) return null

  // Walk back from the state collecting city words, stopping at a street
  // suffix or a house number — whatever sits between the two is the city.
  const city: string[] = []
  for (let i = stateIdx - 1; i >= 0; i--) {
    const t = tokens[i]
    if (STREET_SUFFIX.test(t) || /^\d+$/.test(t)) break
    city.unshift(t)
    if (city.length >= 3) break
  }
  // A bare directional left over from the street ("9th Street S, Great Falls")
  // would otherwise become part of the city name.
  while (city.length && DIRECTIONAL.test(city[0])) city.shift()

  if (!city.length) return null
  return `${city.join(' ')}, ${abbr}`
}

function stateOnly(q: string): string | null {
  const cs = cityStateOf(q)
  if (cs) return cs.slice(cs.lastIndexOf(',') + 1).trim()
  const tokens = stripPostcode(q).replace(/,/g, ' ').split(/\s+/).filter(Boolean)
  for (let i = tokens.length - 1; i >= 0; i--) {
    const up = tokens[i].toUpperCase()
    if (STATE_ABBRS.has(up)) return up
  }
  return null
}

/** Progressively coarser forms to try, in order, deduped. */
export function queryForms(original: string): { q: string; approximate: boolean }[] {
  const forms: { q: string; approximate: boolean }[] = []
  const push = (q: string | null, approximate: boolean) => {
    const t = q?.trim()
    if (!t) return
    if (forms.some((f) => f.q.toLowerCase() === t.toLowerCase())) return
    forms.push({ q: t, approximate })
  }

  push(original, false)
  push(stripPostcode(original), false)
  push(stripHouseNumber(stripPostcode(original)), false)
  push(expandAbbreviations(stripPostcode(original)), false)
  push(dropFirstSegment(stripPostcode(original)), true)
  push(cityStateOf(original), true)
  push(stateOnly(original), true)
  return forms
}

// ─── providers ───────────────────────────────────────────────────────────────

// Nominatim asks for ≤1 request/second. Only that provider is throttled; the
// other two have no such limit and a whole trip resolves in a couple of seconds.
let nominatimQueue: Promise<unknown> = Promise.resolve()
const NOMINATIM_SPACING_MS = 1100

async function viaEdge(q: string, provider: 'census' | 'nominatim') {
  const { data, error } = await supabase.functions.invoke('geocode', { body: { q, provider } })
  if (error) throw new GeocodeError(`${provider} proxy: ${error.message ?? 'unreachable'}`)
  if (!data?.ok) throw new GeocodeError(data?.error ?? `${provider} failed`)
  if (!data.found) return null
  return { lat: data.lat as number, lon: data.lon as number, matched: (data.matched as string) ?? q }
}

async function census(q: string) {
  const hit = await viaEdge(q, 'census')
  return hit && { ...hit, timeZone: null, source: 'census' as const }
}

async function nominatim(q: string) {
  const run = nominatimQueue.then(() => viaEdge(q, 'nominatim'))
  nominatimQueue = run.then(
    () => new Promise((r) => setTimeout(r, NOMINATIM_SPACING_MS)),
    () => new Promise((r) => setTimeout(r, NOMINATIM_SPACING_MS))
  )
  const hit = await run
  return hit && { ...hit, timeZone: null, source: 'nominatim' as const }
}

/**
 * Open-Meteo's geocoder — place names worldwide, proper CORS, no throttle, and
 * the only one that returns the IANA timezone the sunrise/sunset math needs.
 * Place-oriented: excellent for parks, towns and landmarks; will not resolve a
 * street address.
 */
async function openMeteo(q: string) {
  const url =
    'https://geocoding-api.open-meteo.com/v1/search' +
    `?name=${encodeURIComponent(q)}&count=1&language=en&format=json`

  let res: Response
  try {
    res = await fetch(url)
  } catch (e) {
    throw new GeocodeError(`open-meteo: ${(e as Error).message}`)
  }
  if (!res.ok) throw new GeocodeError(`open-meteo: HTTP ${res.status}`)

  const data = await res.json()
  const hit = data?.results?.[0]
  if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') return null

  const parts = [hit.name, hit.admin1, hit.country_code].filter(Boolean)
  return {
    lat: hit.latitude as number,
    lon: hit.longitude as number,
    timeZone: (hit.timezone as string) ?? null,
    matched: parts.join(', ') || q,
    source: 'open-meteo' as const,
  }
}

/**
 * Run one query form through the provider chain. Returns null when every
 * provider says "no such place"; throws only when they all errored, so the
 * caller can tell a bad location from a bad network.
 */
async function resolveForm(q: string): Promise<Omit<GeoResult, 'approximate'> | null> {
  const chain = looksLikeUsAddress(q)
    ? [census, openMeteo, nominatim]
    : [openMeteo, census, nominatim]

  let lastError: Error | null = null
  let sawDefinitiveMiss = false

  for (const provider of chain) {
    try {
      const hit = await provider(q)
      if (hit) return hit
      sawDefinitiveMiss = true
    } catch (e) {
      lastError = e as Error
    }
  }

  if (sawDefinitiveMiss) return null // at least one provider answered: genuinely not found
  throw new GeocodeError(lastError?.message ?? 'All geocoders failed')
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Resolve a free-text location, caching the winning form on the ORIGINAL
 * string. Returns null when nothing resolves; throws (GeocodeError) when the
 * providers couldn't be reached, so React Query retries instead of caching a
 * blank forever.
 */
export async function geocode(location: string): Promise<GeoResult | null> {
  const key = normalizeLocation(location)
  if (!key) return null

  const cached = await idbGet<GeoResult>(CACHE_PREFIX + key)
  if (cached) return cached

  // Adopt a v1 entry rather than make everyone pay for a cold cache again.
  const legacy = await idbGet<{ lat: number; lon: number }>(LEGACY_PREFIX + key)
  if (legacy && Number.isFinite(legacy.lat) && Number.isFinite(legacy.lon)) {
    const adopted: GeoResult = {
      ...legacy, timeZone: null, matched: location, source: 'nominatim', approximate: false,
    }
    await idbSet(CACHE_PREFIX + key, adopted)
    return adopted
  }

  const failed = failedAt.get(key)
  if (failed && Date.now() - failed < NEGATIVE_TTL_MS) return null
  if (failed) failedAt.delete(key)

  const existing = inflight.get(key)
  if (existing) return existing

  const run = (async (): Promise<GeoResult | null> => {
    let lastError: Error | null = null
    for (const form of queryForms(location)) {
      try {
        const hit = await resolveForm(form.q)
        if (hit) {
          const result: GeoResult = { ...hit, approximate: form.approximate }
          await idbSet(CACHE_PREFIX + key, result)
          return result
        }
      } catch (e) {
        lastError = e as Error // form errored; a coarser one may still work
      }
    }
    // Every form was tried. If they all errored we never learned anything, so
    // surface it as retryable rather than remembering a failure we didn't see.
    if (lastError) throw lastError
    failedAt.set(key, Date.now())
    return null
  })()
    .finally(() => inflight.delete(key))

  inflight.set(key, run)
  return run
}

/**
 * Coordinates for a location, as a query so components can use them without
 * threading the async call through. Deliberately separate from the weather
 * query: sunrise/sunset is pure math and should still render when Open-Meteo
 * is unreachable, as long as we know where the place is.
 */
export function useGeocode(location: string | null) {
  return useQuery({
    queryKey: ['geocode', location ? normalizeLocation(location) : ''],
    queryFn: () => geocode(location!),
    enabled: !!location,
    staleTime: Infinity, // a place does not move
    retry: 1,
  })
}

/**
 * Resolve a batch of locations in the background so the Days list, the day
 * pages and the export are warm before anyone asks. Cached and in-flight
 * entries short-circuit, so calling this repeatedly is cheap.
 *
 * Bounded concurrency: Census and Open-Meteo have no throttle, but firing
 * thirty lookups at once on a phone helps nobody. Errors are swallowed — this
 * is speculative work and the real queries report failures themselves.
 */
export async function prewarmGeocodes(locations: (string | null)[], concurrency = 4): Promise<void> {
  const queue = Array.from(new Set(locations.filter((l): l is string => !!l && !!l.trim())))
  if (!queue.length) return

  let next = 0
  const worker = async () => {
    while (next < queue.length) {
      const loc = queue[next++]
      await geocode(loc).catch(() => null)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
}
