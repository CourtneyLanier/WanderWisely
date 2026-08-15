// Geocoding proxy — the two providers a browser cannot call directly.
//
// Why this exists:
//   • US Census sends no Access-Control-Allow-Origin header at all, so a
//     browser fetch is blocked outright (verified against the live endpoint
//     with an Origin header present).
//   • Nominatim's usage policy wants an identifying User-Agent, which a browser
//     fetch() is forbidden from setting — and its CORS headers were absent in
//     testing too. Proxying solves both.
//
// Open-Meteo's geocoder is NOT here: it sends `Access-Control-Allow-Origin: *`
// and is called directly from the client. See src/lib/geocoding.ts, which owns
// the provider ordering.
//
// Contract (always HTTP 200 — the envelope carries the real outcome):
//   POST { q: string, provider: 'census' | 'nominatim' }
//     → { ok: true,  found: true, lat, lon, source, matched }
//     → { ok: true,  found: false }            // valid query, no match: try the next form
//     → { ok: false, error: string }           // upstream failure: caller may retry
//
// Coordinate order: Census returns { x: longitude, y: latitude }, inverted from
// the usual convention. That is resolved HERE so the browser only ever sees
// lat/lon and the trap cannot escape this file.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

// Identifies us to Nominatim per their usage policy.
const USER_AGENT = 'WanderWisely/1.0 (+https://wanderwisely.app)'
const UPSTREAM_TIMEOUT_MS = 8000

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers, signal: ctl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

interface Hit {
  lat: number
  lon: number
  matched: string
}

/**
 * US Census Geocoder — TIGER address ranges. Authoritative for US street
 * addresses including rural and unincorporated areas, which is exactly where
 * OpenStreetMap's volunteer-contributed address data runs out. Tolerates
 * unpunctuated input. No API key, no registration.
 */
async function census(q: string): Promise<Hit | null> {
  const url =
    'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress' +
    `?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&format=json`

  const data = (await fetchJson(url)) as {
    result?: {
      addressMatches?: Array<{
        coordinates?: { x?: number; y?: number }
        matchedAddress?: string
      }>
    }
  }

  const match = data?.result?.addressMatches?.[0]
  const c = match?.coordinates
  if (!match || typeof c?.x !== 'number' || typeof c?.y !== 'number') return null

  // x = longitude, y = latitude. Do not "tidy" this.
  return { lat: c.y, lon: c.x, matched: match.matchedAddress ?? q }
}

/** Nominatim — last resort: non-US addresses and anything the others miss. */
async function nominatim(q: string): Promise<Hit | null> {
  const url =
    'https://nominatim.openstreetmap.org/search' +
    `?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`

  const data = (await fetchJson(url, {
    'User-Agent': USER_AGENT,
    'Accept-Language': 'en',
  })) as Array<{ lat?: string; lon?: string; display_name?: string }>

  const hit = Array.isArray(data) ? data[0] : undefined
  if (!hit?.lat || !hit?.lon) return null

  const lat = parseFloat(hit.lat)
  const lon = parseFloat(hit.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  return { lat, lon, matched: hit.display_name ?? q }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return ok({ ok: false, error: 'Invalid JSON body' })
  }

  const q = typeof body.q === 'string' ? body.q.trim() : ''
  const provider = body.provider
  if (!q) return ok({ ok: false, error: 'Missing q' })
  if (provider !== 'census' && provider !== 'nominatim') {
    return ok({ ok: false, error: "provider must be 'census' or 'nominatim'" })
  }

  try {
    const hit = provider === 'census' ? await census(q) : await nominatim(q)
    if (!hit) return ok({ ok: true, found: false })

    // Guard against a provider handing back something off-planet, which would
    // otherwise surface as plausible-looking weather for the wrong hemisphere.
    if (Math.abs(hit.lat) > 90 || Math.abs(hit.lon) > 180) {
      return ok({ ok: false, error: `${provider} returned out-of-range coordinates` })
    }

    return ok({ ok: true, found: true, lat: hit.lat, lon: hit.lon, source: provider, matched: hit.matched })
  } catch (e) {
    const msg = (e as Error).name === 'AbortError'
      ? `${provider} timed out`
      : `${provider}: ${(e as Error).message ?? 'request failed'}`
    return ok({ ok: false, error: msg })
  }
})
