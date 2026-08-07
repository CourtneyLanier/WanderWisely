// City-level day titles. Day start/end locations hold full street addresses
// (needed for maps, drive-time, and stop suggestions) — these helpers reduce
// them to "City, ST" for display in day titles only.

const COUNTRY_RE = /^(usa|us|u\.s\.a?\.?|united states( of america)?)$/i
const ZIP_ONLY_RE = /^\d{5}(-\d{4})?$/
const TRAILING_ZIP_RE = /\s+\d{5}(-\d{4})?$/

/**
 * Extract "City, ST" from a free-text address like
 * "WestQuest, 123 Main St, Roosevelt, Wyoming 82190".
 * Falls back to the original string when no city can be found.
 */
export function cityFromLocation(location: string | null | undefined): string | null {
  if (!location) return null
  const parts = location
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return null

  // Drop trailing country / bare-zip segments
  while (
    parts.length > 1 &&
    (COUNTRY_RE.test(parts[parts.length - 1]) || ZIP_ONLY_RE.test(parts[parts.length - 1]))
  ) {
    parts.pop()
  }

  const cleaned = parts.map((p) => p.replace(TRAILING_ZIP_RE, ''))
  if (cleaned.length === 1) return cleaned[0]

  const state = cleaned[cleaned.length - 1]
  const city = cleaned[cleaned.length - 2]
  // "123 Main St, City" (no state segment) — would-be city is a street line
  if (/^\d/.test(city)) return state
  return `${city}, ${state}`
}

export interface DayRoute {
  from: string | null
  to: string | null
  /** Start and end are the same place — show a single city, not "X → X" */
  layover: boolean
}

export function dayRoute(start?: string | null, end?: string | null): DayRoute {
  const from = cityFromLocation(start)
  const to = cityFromLocation(end)
  const layover = !!from && !!to && from.toLowerCase() === to.toLowerCase()
  return { from, to, layover }
}

/** Plain-text day title: "CityA → CityB", or just "City" on layover days. */
export function dayTitle(start?: string | null, end?: string | null): string | null {
  const { from, to, layover } = dayRoute(start, end)
  if (!from && !to) return null
  if (layover) return from
  return `${from || '?'} → ${to || '?'}`
}
