// Sunrise and sunset, computed rather than fetched.
//
// Open-Meteo's forecast endpoint can return daily sunrise/sunset, but only
// inside its 16-day window — which would reintroduce exactly the blanks the
// geocoder work just removed: a trip three months out would show nothing.
//
// These are pure astronomy. Given a latitude, longitude and date they're
// computable exactly, offline, for any date forever. This is the NOAA solar
// position approximation (accurate to well under a minute at the latitudes a
// road trip reaches), so the times render instantly, work with no signal, and
// never spin.
//
// Verified against Open-Meteo's own daily sunrise/sunset across several
// locations and seasons before the expected values in sun.test.ts were pinned.

const DEG = Math.PI / 180

/**
 * Solar zenith for sunrise/sunset. The extra 0.833° covers atmospheric
 * refraction plus the sun's apparent radius — the moment the *upper limb*
 * touches the horizon, which is what "sunrise" means.
 */
const ZENITH_DEG = 90.833

export interface SunTimes {
  /** Absolute instant of sunrise. Format with a timeZone to show local time. */
  sunrise: Date
  sunset: Date
  daylightMinutes: number
}

const rad = (deg: number) => deg * DEG
const deg = (r: number) => r / DEG

/** Julian day at 00:00 UT for a Gregorian date. */
function julianDay(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d) / 86400000 + 2440587.5
}

/**
 * Sunrise/sunset for a coordinate on a date.
 *
 * Returns null inside the polar circles on days with no sunrise or no sunset
 * (midnight sun / polar night) — the geometry genuinely has no solution, and a
 * fabricated time would be worse than none.
 */
export function sunTimes(lat: number, lon: number, dateISO: string): SunTimes | null {
  const [y, m, d] = dateISO.split('-').map(Number)
  if (!y || !m || !d) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  // Julian century, referenced to local solar noon rather than UT midnight —
  // without the longitude term the declination lags by up to half a day, which
  // is what makes the cheaper approximation drift at high latitudes.
  const t = (julianDay(y, m, d) + 0.5 - lon / 360 - 2451545) / 36525

  const meanLong = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
  const meanAnom = 357.52911 + t * (35999.05029 - 0.0001537 * t)
  const eccent = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)

  const eqOfCentre =
    Math.sin(rad(meanAnom)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(rad(2 * meanAnom)) * (0.019993 - 0.000101 * t) +
    Math.sin(rad(3 * meanAnom)) * 0.000289

  const trueLong = meanLong + eqOfCentre
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(rad(125.04 - 1934.136 * t))

  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  const obliqCorr = meanObliq + 0.00256 * Math.cos(rad(125.04 - 1934.136 * t))

  const decl = Math.asin(Math.sin(rad(obliqCorr)) * Math.sin(rad(appLong)))

  // Equation of time, in minutes — the offset between clock noon and solar noon.
  const varY = Math.tan(rad(obliqCorr / 2)) ** 2
  const eqTime =
    4 *
    deg(
      varY * Math.sin(2 * rad(meanLong)) -
        2 * eccent * Math.sin(rad(meanAnom)) +
        4 * eccent * varY * Math.sin(rad(meanAnom)) * Math.cos(2 * rad(meanLong)) -
        0.5 * varY ** 2 * Math.sin(4 * rad(meanLong)) -
        1.25 * eccent ** 2 * Math.sin(2 * rad(meanAnom))
    )

  const latRad = rad(lat)
  const cosHa =
    Math.cos(rad(ZENITH_DEG)) / (Math.cos(latRad) * Math.cos(decl)) -
    Math.tan(latRad) * Math.tan(decl)

  // |cosHa| > 1 → the sun never crosses the horizon that day.
  if (cosHa > 1 || cosHa < -1) return null

  const haDeg = deg(Math.acos(cosHa))

  // Minutes from UTC midnight. Longitude is east-positive.
  const sunriseMin = 720 - 4 * (lon + haDeg) - eqTime
  const sunsetMin = 720 - 4 * (lon - haDeg) - eqTime

  const midnightUTC = Date.UTC(y, m - 1, d)
  return {
    sunrise: new Date(midnightUTC + sunriseMin * 60000),
    sunset: new Date(midnightUTC + sunsetMin * 60000),
    daylightMinutes: Math.round(sunsetMin - sunriseMin),
  }
}

/**
 * Clock time at the location, not on the reader's phone. A Montana park read
 * from a Central-time phone has to show park-local times or the numbers are
 * actively misleading. Falls back to the device zone only when we have no
 * IANA zone for the place.
 */
export function formatInZone(instant: Date, timeZone: string | null, opts?: { compact?: boolean }): string {
  try {
    const s = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(instant)
    // "6:14 AM" → "6:14a" for the tighter compact line.
    return opts?.compact ? s.replace(' AM', 'a').replace(' PM', 'p') : s
  } catch {
    // An unknown IANA zone would otherwise throw and blank the whole card.
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(instant)
  }
}

/** "14h 33m" */
export function formatDaylight(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}
