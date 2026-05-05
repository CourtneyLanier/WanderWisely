// Supabase Edge Function: parse-with-claude
//
// Proxies Anthropic API calls so the API key never reaches the browser.
// Auth: relies on Supabase's default verify_jwt — caller must be a logged-in user.
//
// Request body shape:
//   { mode: 'email',   text: string }
//   { mode: 'pdf',     pdfBase64: string }
//   { mode: 'receipt', imageBase64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }
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
  "details": {}
}

Put any extra useful fields (seat numbers, terminal, baggage, check-in instructions, etc.) inside "details" as key-value pairs.
If a field cannot be determined, use null.`

const RECEIPT_SYSTEM = `You are a receipt parser. Extract spending information from the receipt image and return ONLY valid JSON with no preamble or markdown.

Return this exact structure:
{
  "label": "string (merchant name and brief description, e.g. \\"McDonald's – Breakfast\\" or \\"Shell – Gas\\")",
  "amount": number,
  "card": "food or car"
}

card rules:
- "food" for restaurants, cafes, grocery stores, fast food, bars
- "car" for gas stations, parking, tolls, car washes, auto services

If a field cannot be determined, use null.`

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
      max_tokens: 256,
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
