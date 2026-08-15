// Morning & night weather for a day — temperature at 7 AM where you wake up
// and 9 PM where you sleep, each in that location's own local time. Live
// forecast within 16 days; softer historical normals beyond that. Readings
// are cached through the persisted query cache, so the last values still
// show with no signal (Glacier, Yellowstone).

import { useDayWeather, type WeatherReading } from '@/lib/weather'
import { useGeocode, type GeoResult } from '@/lib/geocoding'
import { sunTimes, formatInZone } from '@/lib/sun'
import type { UseQueryResult } from '@tanstack/react-query'

function shortPlace(location: string): string {
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length <= 1) return location
  // "Old Faithful Inn, Yellowstone NP, WY" → "Old Faithful Inn, Yellowstone NP"
  return parts.slice(0, 2).join(', ')
}

function badges(r: WeatherReading): { label: string; cls: string }[] {
  const out: { label: string; cls: string }[] = []
  if (r.tempF !== null && r.tempF <= 34) out.push({ label: '❄️ Freeze risk', cls: 'text-deep-teal bg-deep-teal/10' })
  else if (r.tempF !== null && r.tempF <= 42) out.push({ label: '🧥 Coat weather', cls: 'text-forest/70 bg-forest/[0.07]' })
  if (r.tempF !== null && r.tempF >= 90) out.push({ label: '🔥 Hot', cls: 'text-terracotta bg-terracotta/10' })
  if (r.rainPct !== null && r.rainPct >= 50) out.push({ label: '☔ Rain likely', cls: 'text-deep-teal bg-deep-teal/10' })
  return out
}

function fmtTemp(r: WeatherReading | undefined): string {
  return r && r.tempF !== null ? `${Math.round(r.tempF)}°` : '—'
}

function fmtRain(r: WeatherReading | undefined): string | null {
  return r && r.rainPct !== null ? `${Math.round(r.rainPct)}% rain` : null
}

// ─── one column (Wake up / Bed down) ─────────────────────────────────────────

function WeatherSlot({
  title,
  time,
  location,
  query,
  sun,
  onFixLocation,
}: {
  title: string
  time: string
  location: string
  query: UseQueryResult<WeatherReading>
  /** Sunrise or sunset for this slot's location — computed, so it can show
   *  even when the temperature lookup failed. */
  sun: { icon: string; label: string } | null
  /** Owner-only: jump to the day editor to set a manual weather location. */
  onFixLocation?: () => void
}) {
  const reading = query.data
  const isNormal = reading?.source === 'normal'

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-forest/40 font-medium">
        {title} · {time}
      </p>
      <p className="text-sm font-medium text-forest truncate mt-0.5" title={location}>
        {shortPlace(location)}
      </p>

      {query.isPending ? (
        <div className="mt-1.5 space-y-1.5 animate-pulse">
          <div className="h-6 w-14 bg-forest/10 rounded" />
          <div className="h-3 w-20 bg-forest/[0.06] rounded" />
        </div>
      ) : query.isError || !reading ? (
        // The API errored — worth offering a retry, since it may be transient.
        <div className="mt-1.5">
          <p className="text-sm text-forest/35">Weather unavailable</p>
          <button
            onClick={() => query.refetch()}
            className="text-xs text-deep-teal hover:text-forest transition-colors mt-0.5"
          >
            Retry
          </button>
        </div>
      ) : reading.tempF === null ? (
        // Different failure entirely: the place couldn't be geocoded. A bare
        // dash here was the original complaint — it looked identical to a
        // pending load and gave no hint that anything could be done.
        <div className="mt-1.5">
          <p className="text-sm text-forest/35">Couldn't find this location</p>
          {onFixLocation && (
            <button
              onClick={onFixLocation}
              className="text-xs text-deep-teal hover:text-forest transition-colors mt-0.5"
            >
              Set a weather location
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-2xl font-semibold ${isNormal ? 'text-forest/60' : 'text-forest'}`}>
              {fmtTemp(reading)}
            </span>
            {fmtRain(reading) && (
              <span className={`text-xs ${reading.rainPct! >= 50 ? 'text-deep-teal font-medium' : 'text-forest/50'}`}>
                {fmtRain(reading)}
              </span>
            )}
          </div>
          {isNormal && (
            <p className="text-[10px] text-forest/40 italic mt-0.5">typical for this date</p>
          )}
          {badges(reading).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {badges(reading).map((b) => (
                <span key={b.label} className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${b.cls}`}>
                  {b.label}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {/* Outside the branches above on purpose: sunrise/sunset is pure
          astronomy, so it still renders when the forecast call failed. */}
      {sun && (
        <p className="text-[11px] text-forest/45 mt-1.5">
          {sun.icon} {sun.label}
        </p>
      )}
    </div>
  )
}

/**
 * Sunrise at the wake-up coordinate, sunset at the bed-down one — consistent
 * with the existing morning/night split. Returns null inside the polar circles
 * on days that genuinely have neither.
 */
function sunLabel(
  geo: GeoResult | null | undefined,
  reading: WeatherReading | undefined,
  date: string | null,
  which: 'sunrise' | 'sunset'
): { icon: string; label: string } | null {
  if (!geo || !date) return null
  const t = sunTimes(geo.lat, geo.lon, date)
  if (!t) return null
  const zone = geo.timeZone ?? reading?.timeZone ?? null
  return {
    icon: which === 'sunrise' ? '🌅' : '🌇',
    label: formatInZone(which === 'sunrise' ? t.sunrise : t.sunset, zone),
  }
}

// ─── card ────────────────────────────────────────────────────────────────────

export default function DayWeatherCard({
  from,
  to,
  date,
  variant = 'full',
  onFixLocation,
}: {
  from: string | null
  to: string | null
  date: string | null
  variant?: 'full' | 'compact'
  /** Owner-only affordance; guest views are read-only and omit it. */
  onFixLocation?: () => void
}) {
  const { morning, night } = useDayWeather(from, to, date)

  // Coordinates come from their own query rather than the weather reading, so
  // sunrise/sunset survives an Open-Meteo outage. The zone prefers the
  // geocoder's, falling back to the one the forecast response carries — Census
  // and Nominatim don't return a timezone, and street addresses resolve there.
  const fromGeo = useGeocode(from)
  const toGeo = useGeocode(to)

  const sunrise = sunLabel(fromGeo.data, morning.data, date, 'sunrise')
  const sunset = sunLabel(toGeo.data, night.data, date, 'sunset')

  if (!from || !to || !date) return null

  const offlineNoData =
    navigator.onLine === false && !morning.data && !night.data

  if (variant === 'compact') {
    if (offlineNoData) return null
    const line = (label: string, q: UseQueryResult<WeatherReading>) => {
      if (q.isPending) return `${label} …`
      if (q.isError || !q.data) return `${label} —`
      const rain = q.data.rainPct !== null && q.data.rainPct >= 50 ? ' ☔' : ''
      return `${label} ${fmtTemp(q.data)}${rain}`
    }
    const anyNormal = morning.data?.source === 'normal' || night.data?.source === 'normal'
    return (
      <p className="text-xs text-forest/50 mt-0.5">
        ☀️ {line('7 AM', morning)} · 🌙 {line('9 PM', night)}
        {anyNormal && <span className="text-forest/35 italic"> · typical</span>}
      </p>
    )
  }

  return (
    <div className="mb-4">
      <p className="section-label mb-2">Weather</p>
      <div className="card">
        {offlineNoData ? (
          <p className="text-sm text-forest/40 text-center py-2">
            Weather will load when you're back online.
          </p>
        ) : (
          <div className="flex gap-4">
            <WeatherSlot title="Wake up" time="7 AM" location={from} query={morning}
              sun={sunrise} onFixLocation={onFixLocation} />
            <div className="w-px bg-forest/10 self-stretch" />
            <WeatherSlot title="Bed down" time="9 PM" location={to} query={night}
              sun={sunset} onFixLocation={onFixLocation} />
          </div>
        )}
      </div>
    </div>
  )
}
