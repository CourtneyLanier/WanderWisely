// Shared routing utilities — OSRM drive time on top of the shared geocoder.
// Geocoding itself lives in src/lib/geocoding.ts (three-provider chain).

import { geocode } from '@/lib/geocoding'

export async function calcDriveTime(
  origin: string,
  destination: string
): Promise<{ hours: number; miles: number } | null> {
  // Drive time is a nice-to-have on the Days and Route pages, so an
  // unreachable geocoder degrades to "no estimate" rather than an error.
  const [from, to] = await Promise.all([
    geocode(origin).catch(() => null),
    geocode(destination).catch(() => null),
  ])
  if (!from || !to) return null
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`
    const res = await fetch(url)
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.length) return null
    const route = data.routes[0]
    const hours = Math.round((route.duration / 3600) * 4) / 4 // nearest 0.25
    const miles = Math.round(route.distance / 1609.34)
    return { hours, miles }
  } catch { return null }
}
