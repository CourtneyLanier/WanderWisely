// Shared routing utilities — Nominatim geocoding + OSRM drive time
// Free, no API key required.

export async function geocode(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
    const data = await res.json()
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
  } catch { return null }
}

export async function calcDriveTime(
  origin: string,
  destination: string
): Promise<{ hours: number; miles: number } | null> {
  const [from, to] = await Promise.all([geocode(origin), geocode(destination)])
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
