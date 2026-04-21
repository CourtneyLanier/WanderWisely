import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'

// ── types ──────────────────────────────────────────────────────────────────────

interface GReservation {
  id: string; trip_id: string; type: string | null; title: string | null
  confirmation_number: string | null; date: string | null; time: string | null
  provider: string | null; address: string | null; details: Json
}

// ── helpers ────────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  flight: '✈️', hotel: '🏨', car: '🚗', restaurant: '🍴', activity: '🎯', other: '📋',
}

function fmtDate(s: string | null) {
  if (!s) return null
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(s: string | null) {
  if (!s) return null
  const [h, m] = s.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function detailLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── ReservationCard ────────────────────────────────────────────────────────────

function ReservationCard({ res }: { res: GReservation }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  function copyConf() {
    if (!res.confirmation_number) return
    navigator.clipboard.writeText(res.confirmation_number)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const icon = TYPE_ICONS[res.type ?? 'other'] ?? '📋'
  const detailEntries = res.details
    ? Object.entries(res.details as Record<string, unknown>).filter(([, v]) => v != null)
    : []

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-forest leading-snug truncate">{res.title || '—'}</p>
          {res.provider && (
            <p className="text-xs text-forest/50 mt-0.5 truncate">{res.provider}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
            {res.date && <span className="text-xs text-forest/60">{fmtDate(res.date)}</span>}
            {res.time && <span className="text-xs text-forest/60">{fmtTime(res.time)}</span>}
          </div>
          {res.confirmation_number && (
            <button
              onClick={copyConf}
              className="mt-1.5 flex items-center gap-1.5 text-xs font-mono text-deep-teal bg-deep-teal/8 hover:bg-deep-teal/15 rounded px-2 py-0.5 transition-colors"
            >
              <span>{copied ? '✓ Copied!' : res.confirmation_number}</span>
              {!copied && <span className="text-deep-teal/50">⎘</span>}
            </button>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-forest/30 hover:text-forest transition-colors text-sm mt-0.5 shrink-0 px-1"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-forest/10 space-y-2">
          {res.address && (
            <div>
              <span className="text-xs text-forest/40 uppercase tracking-wide">Address</span>
              <p className="text-sm text-forest mt-0.5">{res.address}</p>
            </div>
          )}
          {detailEntries.length > 0 && (
            <div>
              <span className="text-xs text-forest/40 uppercase tracking-wide">Details</span>
              <div className="mt-1 space-y-0.5">
                {detailEntries.map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-sm">
                    <span className="text-forest/50 shrink-0">{detailLabel(k)}:</span>
                    <span className="text-forest">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GuestWalletPage() {
  const { shareCode } = useParams<{ shareCode: string }>()

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ['guest_reservations', shareCode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('guest_get_reservations', { p_share_code: shareCode! })
      if (error) throw error
      return ((data ?? []) as GReservation[]).sort((a, b) => {
        if (!a.date) return 1
        if (!b.date) return -1
        return a.date.localeCompare(b.date)
      })
    },
    enabled: !!shareCode,
  })

  if (isLoading) {
    return (
      <div className="p-4 pt-6 flex justify-center py-20">
        <p className="text-forest/40 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="p-4 pt-6 pb-10">
      <h1 className="font-display text-2xl text-forest mb-4">Reservations</h1>

      {reservations.length === 0 ? (
        <div className="card text-center py-14 space-y-2">
          <p className="text-3xl">🎫</p>
          <p className="text-forest/50 text-sm">No reservations added yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reservations.map((r) => (
            <ReservationCard key={r.id} res={r} />
          ))}
        </div>
      )}
    </div>
  )
}
