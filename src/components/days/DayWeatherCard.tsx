// Morning & night weather for a day — temperature at 7 AM where you wake up
// and 9 PM where you sleep, each in that location's own local time. Live
// forecast within 16 days; softer historical normals beyond that. Readings
// are cached through the persisted query cache, so the last values still
// show with no signal (Glacier, Yellowstone).

import { useDayWeather, type WeatherReading } from '@/lib/weather'
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
}: {
  title: string
  time: string
  location: string
  query: UseQueryResult<WeatherReading>
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
        <p className="text-sm text-forest/35 mt-1.5">Weather unavailable</p>
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
    </div>
  )
}

// ─── card ────────────────────────────────────────────────────────────────────

export default function DayWeatherCard({
  from,
  to,
  date,
  variant = 'full',
}: {
  from: string | null
  to: string | null
  date: string | null
  variant?: 'full' | 'compact'
}) {
  const { morning, night } = useDayWeather(from, to, date)

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
            <WeatherSlot title="Wake up" time="7 AM" location={from} query={morning} />
            <div className="w-px bg-forest/10 self-stretch" />
            <WeatherSlot title="Bed down" time="9 PM" location={to} query={night} />
          </div>
        )}
      </div>
    </div>
  )
}
