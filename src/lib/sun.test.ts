// Expected values were cross-checked against Open-Meteo's own daily
// sunrise/sunset for these exact coordinates and dates before being pinned
// here; every one agreed to within a minute. They're frozen as UTC so the
// test doesn't depend on the machine's timezone.

import { describe, it, expect } from 'vitest'
import { sunTimes, formatInZone, formatDaylight } from '@/lib/sun'

const utcHM = (d: Date) => d.toISOString().slice(11, 16)

const OLD_FAITHFUL = { lat: 44.4596, lon: -110.8313 }
const PLANT_CITY = { lat: 28.0875, lon: -82.1456 }
const GREAT_FALLS = { lat: 47.5053, lon: -111.3008 }
const ANCHORAGE = { lat: 61.2181, lon: -149.9003 }
const UTQIAGVIK = { lat: 71.2906, lon: -156.7886 } // above the Arctic Circle

describe('sunTimes', () => {
  it('matches Open-Meteo at a mid-latitude park', () => {
    const s = sunTimes(OLD_FAITHFUL.lat, OLD_FAITHFUL.lon, '2026-08-21')!
    expect(utcHM(s.sunrise)).toBe('12:33')
    expect(utcHM(s.sunset)).toBe('02:19') // next UTC day; still Aug 21 locally
    expect(s.daylightMinutes).toBe(825)
  })

  it('matches at a low latitude', () => {
    const s = sunTimes(PLANT_CITY.lat, PLANT_CITY.lon, '2026-08-21')!
    expect(utcHM(s.sunrise)).toBe('11:01')
    expect(s.daylightMinutes).toBe(780)
  })

  // High latitude is where the cheaper approximation drifted by ~5 minutes.
  it('holds up at high latitude', () => {
    const s = sunTimes(ANCHORAGE.lat, ANCHORAGE.lon, '2026-08-20')!
    expect(utcHM(s.sunrise)).toBe('14:22')
    expect(utcHM(s.sunset)).toBe('05:43')
    expect(s.daylightMinutes).toBe(921)
  })

  it('matches at Great Falls', () => {
    const s = sunTimes(GREAT_FALLS.lat, GREAT_FALLS.lon, '2026-08-25')!
    expect(utcHM(s.sunrise)).toBe('12:35')
    expect(s.daylightMinutes).toBe(824)
  })

  // The whole point of computing rather than fetching: Open-Meteo only returns
  // sunrise/sunset inside a 16-day window.
  it('works for a date far beyond any forecast horizon', () => {
    const s = sunTimes(OLD_FAITHFUL.lat, OLD_FAITHFUL.lon, '2029-06-21')
    expect(s).not.toBeNull()
    expect(s!.daylightMinutes).toBeGreaterThan(900) // solstice: longer than August
  })

  it('reports longer days in summer than in winter', () => {
    const jun = sunTimes(GREAT_FALLS.lat, GREAT_FALLS.lon, '2026-06-21')!
    const dec = sunTimes(GREAT_FALLS.lat, GREAT_FALLS.lon, '2026-12-21')!
    expect(jun.daylightMinutes).toBeGreaterThan(dec.daylightMinutes + 400)
  })

  // Inside the polar circles the geometry has no solution; a fabricated time
  // would be worse than none.
  it('returns null during midnight sun and polar night', () => {
    expect(sunTimes(UTQIAGVIK.lat, UTQIAGVIK.lon, '2026-06-21')).toBeNull()
    expect(sunTimes(UTQIAGVIK.lat, UTQIAGVIK.lon, '2026-12-21')).toBeNull()
  })

  it('rejects unusable input rather than returning a wrong time', () => {
    expect(sunTimes(NaN, -110, '2026-08-21')).toBeNull()
    expect(sunTimes(44, -110, 'not-a-date')).toBeNull()
  })
})

describe('formatInZone', () => {
  const s = sunTimes(OLD_FAITHFUL.lat, OLD_FAITHFUL.lon, '2026-08-21')!

  // The point of carrying an IANA zone: park-local, not phone-local.
  it('renders in the location timezone', () => {
    expect(formatInZone(s.sunrise, 'America/Denver')).toBe('6:33 AM')
    expect(formatInZone(s.sunset, 'America/Denver')).toBe('8:19 PM')
  })

  it('renders the same instant differently elsewhere', () => {
    expect(formatInZone(s.sunrise, 'America/New_York')).toBe('8:33 AM')
  })

  it('compacts for the tight line', () => {
    expect(formatInZone(s.sunrise, 'America/Denver', { compact: true })).toBe('6:33a')
  })

  // An unknown zone must not throw and blank the whole weather card.
  it('falls back instead of throwing on a bad zone', () => {
    expect(() => formatInZone(s.sunrise, 'Mars/Olympus_Mons')).not.toThrow()
    expect(formatInZone(s.sunrise, null)).toMatch(/\d{1,2}:\d{2} [AP]M/)
  })
})

describe('formatDaylight', () => {
  it('formats hours and minutes', () => {
    expect(formatDaylight(825)).toBe('13h 45m')
    expect(formatDaylight(780)).toBe('13h 00m')
  })
})
