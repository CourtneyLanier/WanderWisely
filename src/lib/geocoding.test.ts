// The query-form cascade is the part of geocoding that can quietly produce a
// wrong-but-plausible answer, so it's pinned here. Network behaviour isn't
// tested — these are the pure string transforms the chain feeds on.

import { describe, it, expect, beforeAll, vi } from 'vitest'

let looksLikeUsAddress: (q: string) => boolean
let cityStateOf: (q: string) => string | null
let queryForms: (q: string) => { q: string; approximate: boolean }[]

beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
  ;({ looksLikeUsAddress, cityStateOf, queryForms } = await import('@/lib/geocoding'))
})

// The address that started all of this: OpenStreetMap has no data for that road
// at any level of detail, so every street-level form must fail over to the city.
const REGRESSION = '2128 Lanier Rd Plant City FL 33565'

describe('looksLikeUsAddress', () => {
  it('accepts a leading house number', () => {
    expect(looksLikeUsAddress(REGRESSION)).toBe(true)
  })
  it('accepts a bare street suffix', () => {
    expect(looksLikeUsAddress('Going To The Sun Road')).toBe(true)
  })
  it('accepts a trailing state code', () => {
    expect(looksLikeUsAddress('Plant City, FL')).toBe(true)
  })
  it('rejects an obvious place name, so Census is skipped', () => {
    expect(looksLikeUsAddress('Yellowstone National Park')).toBe(false)
  })
})

describe('cityStateOf', () => {
  // Comma splitting fails here — the stored value has no commas at all.
  it('finds a two-word city in an unpunctuated address', () => {
    expect(cityStateOf(REGRESSION)).toBe('Plant City, FL')
  })
  it('works with commas too', () => {
    expect(cityStateOf('2128 Lanier Rd, Plant City, FL 33565')).toBe('Plant City, FL')
  })
  it('handles a one-word city', () => {
    expect(cityStateOf('1305 Camas Dr, Great Falls, MT 59404')).toBe('Great Falls, MT')
  })
  // A directional hanging off the street name is not part of the city.
  it('drops a trailing street directional', () => {
    expect(cityStateOf('1120 9th Street S, Great Falls, MT 59405')).toBe('Great Falls, MT')
    expect(cityStateOf('100 W Main St Bozeman MT')).toBe('Bozeman, MT')
  })
  it('resolves a spelled-out state', () => {
    expect(cityStateOf('123 Main Street Bozeman Montana')).toBe('Bozeman, MT')
  })
  it('returns null when there is no state to anchor on', () => {
    expect(cityStateOf('Old Faithful Inn')).toBeNull()
  })
})

describe('queryForms', () => {
  it('starts with the string as entered', () => {
    expect(queryForms(REGRESSION)[0]).toEqual({ q: REGRESSION, approximate: false })
  })

  it('walks down to city + state for the regression address', () => {
    const qs = queryForms(REGRESSION).map((f) => f.q)
    expect(qs).toContain('2128 Lanier Rd Plant City FL')   // postcode stripped
    expect(qs).toContain('Lanier Rd Plant City FL')        // house number stripped
    expect(qs).toContain('Plant City, FL')                 // state-anchored parse
    expect(qs).toContain('FL')                             // last resort
  })

  it('expands park abbreviations and drops the leading segment', () => {
    const qs = queryForms('Old Faithful Inn, Yellowstone NP, WY').map((f) => f.q)
    expect(qs).toContain('Old Faithful Inn, Yellowstone National Park, WY')
    expect(qs).toContain('Yellowstone NP, WY')
  })

  // NM is New Mexico far more often than National Monument; expanding it would
  // mangle every New Mexico address to chase a handful of monuments.
  it('leaves NM alone', () => {
    const qs = queryForms('456 Cerrillos Rd Santa Fe NM 87501').map((f) => f.q)
    expect(qs.some((q) => q.includes('National Monument'))).toBe(false)
    expect(qs).toContain('Santa Fe, NM')
  })

  it('marks coarsened forms approximate and precise ones not', () => {
    const forms = queryForms(REGRESSION)
    expect(forms.find((f) => f.q === REGRESSION)!.approximate).toBe(false)
    expect(forms.find((f) => f.q === 'Plant City, FL')!.approximate).toBe(true)
  })

  it('does not repeat a form when coarsening changes nothing', () => {
    const qs = queryForms('Plant City, FL').map((f) => f.q)
    expect(new Set(qs).size).toBe(qs.length)
  })
})
