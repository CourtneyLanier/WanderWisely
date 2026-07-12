// Claude-powered "cool stops along the route" suggestions.
// Calls the parse-with-claude edge function ('stops' mode), which uses web
// search to ground suggestions in real, currently-open places.

import { supabase } from '@/lib/supabase'

export type StopCategory = 'quirky' | 'food' | 'coffee' | 'scenic' | 'shop' | 'attraction'

export interface SuggestedStop {
  name: string
  category: StopCategory
  location: string
  description: string
  detour: string
  address: string | null
  website: string | null
}

export const STOP_CATEGORY_ICONS: Record<StopCategory, string> = {
  quirky: '🛸',
  food: '🍴',
  coffee: '☕',
  scenic: '🏞️',
  shop: '🛍️',
  attraction: '🎯',
}

const VALID_CATEGORIES: StopCategory[] = ['quirky', 'food', 'coffee', 'scenic', 'shop', 'attraction']

/**
 * Ask Claude for interesting stops along a driving route.
 * Takes ~30-60 seconds (it searches the web to verify places are real & open).
 * Throws with a user-facing message on failure.
 */
export async function suggestStops(
  from: string,
  to: string,
  date?: string | null
): Promise<SuggestedStop[]> {
  const { data, error } = await supabase.functions.invoke('parse-with-claude', {
    body: { mode: 'stops', from, to, date: date ?? undefined },
  })
  if (error) throw new Error(error.message ?? 'Could not reach the suggestion service.')
  if (!data?.ok) throw new Error(data?.error ?? 'Could not get suggestions.')

  const raw = data.text as string
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Got an unexpected response — please try again.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error('Got an unexpected response — please try again.')
  }
  if (!Array.isArray(parsed)) throw new Error('Got an unexpected response — please try again.')

  const stops: SuggestedStop[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    if (typeof s.name !== 'string' || !s.name.trim()) continue
    const category = VALID_CATEGORIES.includes(s.category as StopCategory)
      ? (s.category as StopCategory)
      : 'attraction'
    stops.push({
      name: s.name.trim(),
      category,
      location: typeof s.location === 'string' ? s.location : '',
      description: typeof s.description === 'string' ? s.description : '',
      detour: typeof s.detour === 'string' ? s.detour : '',
      address: typeof s.address === 'string' && s.address.trim() ? s.address.trim() : null,
      website:
        typeof s.website === 'string' && /^https?:\/\//i.test(s.website.trim())
          ? s.website.trim()
          : null,
    })
  }
  if (stops.length === 0) throw new Error('No stops found for this route — please try again.')
  return stops
}
