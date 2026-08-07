// Supabase Edge Function: parse-with-claude
//
// Proxies Anthropic API calls so the API key never reaches the browser.
// Auth: relies on Supabase's default verify_jwt — caller must be a logged-in user.
//
// Request body shape:
//   { mode: 'email',   text: string }
//   { mode: 'pdf',     pdfBase64: string }
//   { mode: 'receipt', imageBase64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }
//   { mode: 'stops',   from: string, to: string, date?: string }
//
// Response (always HTTP 200, envelope tells the frontend what happened):
//   { ok: true,  text: string }      // raw text from Claude — frontend parses JSON out of it
//   { ok: false, error: string }

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

const SONNET = 'claude-sonnet-4-6'
const HAIKU = 'claude-haiku-4-5-20251001'

const RESERVATION_SYSTEM = `You are a travel reservation parser. Extract structured data from the pasted email confirmation text and return ONLY valid JSON with no preamble or markdown.

Return this exact structure:
{
  "type": "flight|hotel|car|restaurant|activity|other",
  "title": "string",
  "provider": "string",
  "confirmation_number": "string",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "address": "string",
  "cost": number,
  "listing_url": "string",
  "details": {}
}

cost: the total amount charged or due (as a number, no currency symbol). Use null if not found.
listing_url: for hotels/lodging, the URL to the property listing on Airbnb, VRBO, Booking.com, Hotels.com, etc. Use null if not found.
time: for hotels, this is the check-in time.

For hotel/lodging reservations, extract these fields into "details" when available:
  check_out_time: "HH:MM" (checkout time)
  nightly_rate: number (per-night cost, no currency symbol)
  room_type: "string" (e.g. "King Suite", "2BR Cabin", "Standard Room")
  bedrooms: number
  beds: number
  bathrooms: number

For flights, put seat number, terminal, gate, baggage allowance in "details".
For car rentals, put pickup location, car class, insurance details in "details".
Put any other extra useful fields in "details" as key-value pairs.
If a field cannot be determined, use null.`

const RECEIPT_SYSTEM = `You are a receipt parser. Extract spending information from the receipt image and return ONLY valid JSON with no preamble or markdown.

Return this exact structure:
{
  "date": "YYYY-MM-DD or null",
  "items": [
    {
      "label": "string (merchant name and brief description, e.g. \\"McDonald's – Breakfast\\" or \\"Shell – Gas\\")",
      "amount": number,
      "card": "food or car or hotel or misc"
    }
  ]
}

card rules:
- "food" for restaurants, cafes, grocery stores, fast food, bars, snacks, drinks
- "car" for gas/fuel, parking, tolls, car washes, auto services
- "hotel" for hotel stays, lodging, room charges, resort fees
- "misc" for everything else (shopping, souvenirs, attractions, tickets, pharmacy, etc.)

Splitting rules:
- Most receipts are ONE item: the merchant and the receipt total.
- Split into multiple items ONLY when the receipt clearly contains purchases in different card categories — e.g. a gas station receipt with $60.00 of fuel plus $5.85 of chips and a drink becomes two items: fuel under "car" and the snacks under "food".
- The item amounts must add up to the receipt's grand total. Fold tax and fees proportionally into the items (or into the largest item if allocation is unclear).
- Never split purchases that belong to the same card category.

date: extract the transaction date from the receipt if visible (format YYYY-MM-DD). Use null if not found.

If a field cannot be determined, use null.`

const STOPS_SYSTEM = `You are a road-trip scout for a family travel app. Given a driving route, find genuinely interesting stops along or near it: quirky roadside attractions, beloved local restaurants and diners, great local coffee shops, farm stands, scenic pull-offs, and one-of-a-kind local shops.

When the user message lists the actual GPS driving corridor (the roads and waypoint towns the route follows), treat it as a hard constraint: every stop must be in or very near one of those towns or right along one of those roads. Never include a place just because it is geographically between the endpoints — if it is not near the driving corridor, adding it means a long detour. A stop should add at most about 20 minutes of total detour to the day's drive.

Use web search to make sure the places are real and currently open — do NOT include anything that is permanently closed, and prefer well-loved local gems over national chains. Everything must be family-friendly. Be fast: run at most 3 quick searches, then answer immediately from what you found plus what you already know.

Return ONLY a valid JSON array (no preamble, no markdown fences) of 6 to 8 stops, ordered from the start of the drive to the end, with a mix of categories:
[
  {
    "name": "string",
    "category": "quirky" | "food" | "coffee" | "scenic" | "shop" | "attraction",
    "location": "Town, ST",
    "description": "1-2 sentences on what it is and why it's worth the stop",
    "detour": "how far off the route it is and roughly how much time it adds, e.g. 'right on US-89 — no real detour' or 'about 10 min off the highway (adds ~20 min)'",
    "address": "street address if known, otherwise null",
    "website": "the place's official website URL if you saw one in your search results, otherwise null"
  }
]

website: only include a URL you actually saw in search results — never guess or construct one. Prefer the place's own site over review/aggregator pages.`

// ── Route mapping (free OSM services, no API key) ─────────────────────────────
// Before asking Claude for stops, we map the actual driving route so the
// suggestions follow the roads a GPS would pick, not a straight line between
// the endpoints. Nominatim geocodes the endpoints and names the towns along
// the way; OSRM's public demo server computes the driving route between them.
// Everything here is best-effort: any failure returns null and 'stops' mode
// falls back to the old endpoint-only prompt.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org'
const OSRM_URL = 'https://router.project-osrm.org'
// Nominatim requires an identifying User-Agent and max ~1 request/second.
const GEO_HEADERS = { 'User-Agent': 'WanderWisely/1.0 (family road-trip planner)' }
const NOMINATIM_GAP_MS = 1100

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// deno-lint-ignore no-explicit-any
async function fetchJson(url: string, timeoutMs: number): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: GEO_HEADERS, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function geocode(place: string): Promise<{ lat: number; lon: number } | null> {
  const data = await fetchJson(
    `${NOMINATIM_URL}/search?format=jsonv2&limit=1&q=${encodeURIComponent(place)}`,
    8000
  )
  const hit = Array.isArray(data) ? data[0] : null
  if (!hit?.lat || !hit?.lon) return null
  const lat = parseFloat(hit.lat)
  const lon = parseFloat(hit.lon)
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}

// zoom=14 resolves small highway towns; county is the fallback for empty
// stretches (still useful alongside the road names).
async function reverseTown(lat: number, lon: number): Promise<string | null> {
  const data = await fetchJson(
    `${NOMINATIM_URL}/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lon}`,
    8000
  )
  const a = data?.address
  if (!a) return null
  const town = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ?? a.county
  return town ? (a.state ? `${town}, ${a.state}` : town) : null
}

function haversineMiles(a: [number, number], b: [number, number]): number {
  const R = 3958.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Pick n points spaced evenly by road distance along the route polyline
// (index-based sampling would bunch up where the geometry is dense).
function samplePoints(coords: [number, number][], n: number): [number, number][] {
  const cumulative: number[] = [0]
  for (let i = 1; i < coords.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineMiles(coords[i - 1], coords[i]))
  }
  const total = cumulative[cumulative.length - 1]
  if (total === 0) return []
  const points: [number, number][] = []
  for (let k = 1; k <= n; k++) {
    const target = (total * k) / (n + 1)
    const idx = cumulative.findIndex((d) => d >= target)
    points.push(coords[idx === -1 ? coords.length - 1 : idx])
  }
  return points
}

interface RouteContext {
  towns: string[]
  roads: string[]
  miles: number
  driveText: string
}

async function getRouteContext(from: string, to: string): Promise<RouteContext | null> {
  const start = await geocode(from)
  await sleep(NOMINATIM_GAP_MS)
  const end = await geocode(to)
  if (!start || !end) return null

  const data = await fetchJson(
    `${OSRM_URL}/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}` +
      `?overview=full&geometries=geojson&steps=true`,
    12000
  )
  const route = data?.routes?.[0]
  const coords = route?.geometry?.coordinates as [number, number][] | undefined
  if (!route || !Array.isArray(coords) || coords.length < 2) return null

  // Major roads: names/refs of any step longer than ~10 miles.
  const roads: string[] = []
  // deno-lint-ignore no-explicit-any
  for (const leg of route.legs ?? []) {
    // deno-lint-ignore no-explicit-any
    for (const step of leg.steps ?? []) {
      if ((step.distance ?? 0) < 16000) continue
      const label = (step.ref || step.name || '').split(';')[0].trim()
      if (label && !roads.includes(label)) roads.push(label)
    }
  }

  const miles = Math.round(route.distance / 1609.34)
  const totalMin = Math.round(route.duration / 60)
  const driveText = totalMin >= 60 ? `${Math.floor(totalMin / 60)} h ${totalMin % 60} min` : `${totalMin} min`

  // Name the towns at a few evenly spaced points along the actual route.
  const towns: string[] = []
  for (const [lon, lat] of samplePoints(coords, miles > 60 ? 5 : 3)) {
    await sleep(NOMINATIM_GAP_MS)
    const town = await reverseTown(lat, lon)
    if (town && !towns.includes(town)) towns.push(town)
  }
  if (towns.length === 0) return null

  return { towns, roads: roads.slice(0, 6), miles, driveText }
}

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

interface AnthropicPayload {
  model: string
  max_tokens: number
  system: string
  messages: Array<{ role: 'user'; content: unknown }>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return ok({ ok: false, error: 'ANTHROPIC_API_KEY not configured on the server' })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return ok({ ok: false, error: 'Invalid JSON body' })
  }

  const mode = body.mode as string

  // ── 'stops' mode: suggest stops along a driving route, grounded via web search.
  // Handled separately because server-side tools interleave search-result blocks
  // with text and can pause mid-turn (stop_reason 'pause_turn').
  if (mode === 'stops') {
    const from = body.from as string
    const to = body.to as string
    if (!from || !to || typeof from !== 'string' || typeof to !== 'string') {
      return ok({ ok: false, error: 'Missing route (from/to)' })
    }
    const date = typeof body.date === 'string' ? body.date : null

    // Map the real driving route so suggestions follow the roads, not a
    // straight line. Falls back to the endpoint-only prompt if mapping fails.
    let routeCtx: RouteContext | null = null
    try {
      routeCtx = await getRouteContext(from, to)
    } catch {
      routeCtx = null
    }

    const userText =
      `Driving route: from ${from} to ${to}.` +
      (routeCtx
        ? `\nThe actual GPS driving route is ${routeCtx.miles} miles (about ${routeCtx.driveText})` +
          (routeCtx.roads.length ? `, mainly via ${routeCtx.roads.join(', ')}` : '') +
          `, passing through: ${routeCtx.towns.join(' → ')}.` +
          `\nOnly suggest stops on or very near this driving corridor — in or near the towns listed, or right along the roads named. Skip anything that is between the endpoints as the crow flies but not near the actual roads.`
        : '') +
      (date ? ` Travel date: ${date} — skip anything that would be closed then (seasonal closures, day of week).` : '')

    const messages: Array<{ role: string; content: unknown }> = [
      { role: 'user', content: userText },
    ]

    // Server-side tool loops can return 'pause_turn'; re-send to let Claude resume.
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response
      try {
        res = await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            // Sonnet, not Opus: the edge worker has a hard 150s wall clock, and
            // Opus + web search reliably blows past it. Sonnet fits comfortably.
            model: SONNET,
            max_tokens: 3000,
            system: STOPS_SYSTEM,
            messages,
            tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
          }),
        })
      } catch (e) {
        return ok({ ok: false, error: `Network error calling Anthropic: ${(e as Error).message}` })
      }

      const data = await res.json().catch(() => null) as
        | {
            content?: Array<{ type?: string; text?: string }>
            stop_reason?: string
            error?: { message?: string }
          }
        | null

      if (!res.ok) {
        return ok({ ok: false, error: data?.error?.message ?? `Anthropic returned ${res.status}` })
      }

      if (data?.stop_reason === 'pause_turn' && data.content) {
        // Resume where the server-side tool loop left off.
        messages.push({ role: 'assistant', content: data.content })
        continue
      }

      const text = (data?.content ?? [])
        .filter((b) => b.type === 'text' && b.text)
        .map((b) => b.text)
        .join('\n')
      if (!text) return ok({ ok: false, error: 'Empty response from Claude' })
      return ok({ ok: true, text })
    }
    return ok({ ok: false, error: 'The search took too long — please try again.' })
  }

  let payload: AnthropicPayload
  if (mode === 'email') {
    const text = body.text as string
    if (!text || typeof text !== 'string') return ok({ ok: false, error: 'Missing email text' })
    payload = {
      model: SONNET,
      max_tokens: 1024,
      system: RESERVATION_SYSTEM,
      messages: [{ role: 'user', content: text }],
    }
  } else if (mode === 'pdf') {
    const pdfBase64 = body.pdfBase64 as string
    if (!pdfBase64 || typeof pdfBase64 !== 'string') return ok({ ok: false, error: 'Missing pdfBase64' })
    payload = {
      model: SONNET,
      max_tokens: 1024,
      system: RESERVATION_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          { type: 'text', text: 'Parse this confirmation document.' },
        ],
      }],
    }
  } else if (mode === 'receipt') {
    const imageBase64 = body.imageBase64 as string
    const mediaType = body.mediaType as string
    if (!imageBase64 || typeof imageBase64 !== 'string') return ok({ ok: false, error: 'Missing imageBase64' })
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowed.includes(mediaType)) return ok({ ok: false, error: `Unsupported image type: ${mediaType}` })
    payload = {
      model: HAIKU,
      max_tokens: 512,
      system: RECEIPT_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Parse this receipt.' },
        ],
      }],
    }
  } else {
    return ok({ ok: false, error: `Unknown mode: ${mode}` })
  }

  let res: Response
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return ok({ ok: false, error: `Network error calling Anthropic: ${(e as Error).message}` })
  }

  const data = await res.json().catch(() => null) as
    | { content?: Array<{ text?: string }>; error?: { message?: string } }
    | null

  if (!res.ok) {
    const message = data?.error?.message ?? `Anthropic returned ${res.status}`
    return ok({ ok: false, error: message })
  }

  const text = data?.content?.[0]?.text ?? ''
  if (!text) return ok({ ok: false, error: 'Empty response from Claude' })

  return ok({ ok: true, text })
})
