import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePremium } from '@/hooks/usePremium'
import type { PayApp, Traveler, Trip } from '@/types'

// Settings "Group Split" card (blueprint §7) — mirrors the spreadsheet's
// Start Here tab: enable toggle (premium-gated), currency, settle-up deadline,
// share-with-group toggle, and the traveler roster (up to 8).
// Everything saves immediately, like the per-tab share switches.

const MAX_TRAVELERS = 8

const PAY_APPS: { value: PayApp; label: string }[] = [
  { value: 'venmo', label: 'Venmo' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'cashapp', label: 'Cash App' },
  { value: 'other', label: 'Other' },
]

export default function GroupSplitSettings({ trip }: { trip: Trip }) {
  const queryClient = useQueryClient()
  const { isPremium } = usePremium()

  const [splitEnabled, setSplitEnabled] = useState(false)
  const [shareSplit, setShareSplit] = useState(false)
  const [currency, setCurrency] = useState('$')
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [rows, setRows] = useState<Traveler[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    // ?? fallbacks so the card renders harmlessly before migration 011 is applied
    setSplitEnabled(trip.split_enabled ?? false)
    setShareSplit(trip.share_split ?? false)
    setCurrency(trip.split_currency ?? '$')
    setDeadline(trip.split_deadline ?? '')
  }, [trip])

  const { data: travelers = [] } = useQuery({
    queryKey: ['travelers', trip.id],
    queryFn: async (): Promise<Traveler[]> => {
      const { data, error } = await supabase
        .from('travelers')
        .select('*')
        .eq('trip_id', trip.id)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as Traveler[]
    },
    enabled: !!trip.id && splitEnabled,
  })

  useEffect(() => setRows(travelers), [travelers])

  async function patchTrip(
    patch: Partial<Pick<Trip, 'split_enabled' | 'split_currency' | 'split_deadline' | 'share_split'>>,
    key: string
  ) {
    setSaving(key)
    setError('')
    try {
      const { error } = await supabase.from('trips').update(patch).eq('id', trip.id)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['trip'] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  // ── Traveler CRUD (saves against the travelers table) ──

  function updateLocal(id: string, patch: Partial<Traveler>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  async function saveTraveler(id: string) {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    setError('')
    const { error } = await supabase
      .from('travelers')
      .update({
        name: row.name.trim(),
        party_size: Math.max(1, Math.round(row.party_size) || 1),
        pay_app: row.pay_app,
        // stored WITHOUT leading @ or $ (spreadsheet AH19 does the same)
        pay_handle: row.pay_handle?.replace(/[@$\s]/g, '') || null,
        custom_weight: row.custom_weight > 0 ? row.custom_weight : 1,
        email: row.email?.trim().toLowerCase() || null,
      })
      .eq('id', id)
    if (error) setError(error.message)
    queryClient.invalidateQueries({ queryKey: ['travelers', trip.id] })
  }

  async function addTraveler() {
    if (rows.length >= MAX_TRAVELERS) return
    setError('')
    const { error } = await supabase.from('travelers').insert({
      trip_id: trip.id,
      name: `Traveler ${rows.length + 1}`,
      sort_order: rows.length,
    })
    if (error) setError(error.message)
    queryClient.invalidateQueries({ queryKey: ['travelers', trip.id] })
  }

  async function removeTraveler(id: string) {
    const row = rows.find((r) => r.id === id)
    if (!window.confirm(`Remove ${row?.name || 'this traveler'} from the roster? Expenses they paid stay, but lose their payer.`)) return
    setError('')
    const { error } = await supabase.from('travelers').delete().eq('id', id)
    if (error) setError(error.message)
    queryClient.invalidateQueries({ queryKey: ['travelers', trip.id] })
  }

  async function move(id: string, dir: -1 | 1) {
    const i = rows.findIndex((r) => r.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= rows.length) return
    const a = rows[i], b = rows[j]
    setError('')
    await Promise.all([
      supabase.from('travelers').update({ sort_order: j }).eq('id', a.id),
      supabase.from('travelers').update({ sort_order: i }).eq('id', b.id),
    ])
    queryClient.invalidateQueries({ queryKey: ['travelers', trip.id] })
  }

  const gated = !isPremium && !splitEnabled

  return (
    <div className="card">
      <p className="section-label">Group Split</p>

      {/* Enable toggle — the ONE premium gate (§12). Members never see this. */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-forest">Split expenses with your group</span>
        <button
          role="switch"
          aria-checked={splitEnabled}
          disabled={saving === 'split_enabled' || gated}
          onClick={() => {
            if (gated) return
            const next = !splitEnabled
            setSplitEnabled(next)
            patchTrip({ split_enabled: next }, 'split_enabled')
          }}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            splitEnabled ? 'bg-sage' : 'bg-forest/20'
          } ${saving === 'split_enabled' || gated ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              splitEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
      <p className="text-xs text-forest/40 mb-3">
        Track who paid what and settle up at the end — the Trip Treasurer, built in.
      </p>

      {gated && (
        <p className="text-xs text-gold bg-gold/10 rounded-lg px-3 py-2 mb-1">
          🔒 Group Split comes with WanderWisely premium. Your travelers never pay —
          only the trip planner unlocks it.
        </p>
      )}

      {splitEnabled && (
        <div className="pt-3 border-t border-forest/10 space-y-4">
          {/* Currency + deadline */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-forest mb-1">Currency symbol</label>
              <input
                type="text"
                value={currency}
                maxLength={3}
                onChange={(e) => setCurrency(e.target.value)}
                onBlur={() => patchTrip({ split_currency: currency || '$' }, 'split_currency')}
                className="input font-mono"
              />
            </div>
            <div>
              <label className="block text-sm text-forest mb-1">Settle up by</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => {
                  setDeadline(e.target.value)
                  patchTrip({ split_deadline: e.target.value || null }, 'split_deadline')
                }}
                className="input"
              />
            </div>
          </div>

          {/* Travelers roster */}
          <div>
            <p className="text-sm text-forest mb-1">Travelers ({rows.length}/{MAX_TRAVELERS})</p>
            <p className="text-xs text-forest/40 mb-2">
              Pay handles: drop the @ or $ — just the username. Add an email and that
              person claims their spot automatically when they open your share link.
            </p>
            <div className="space-y-2">
              {rows.map((t, i) => (
                <div key={t.id} className="rounded-lg border border-forest/10 bg-white/50 p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={t.name}
                      onChange={(e) => updateLocal(t.id, { name: e.target.value })}
                      onBlur={() => saveTraveler(t.id)}
                      placeholder="Name"
                      className="input flex-1"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => move(t.id, -1)} disabled={i === 0}
                        className="text-forest/40 hover:text-forest disabled:opacity-20 px-1" title="Move up">↑</button>
                      <button onClick={() => move(t.id, 1)} disabled={i === rows.length - 1}
                        className="text-forest/40 hover:text-forest disabled:opacity-20 px-1" title="Move down">↓</button>
                      <button onClick={() => removeTraveler(t.id)}
                        className="text-terracotta/50 hover:text-terracotta px-1" title="Remove">✕</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-forest/50 mb-0.5"># in party</label>
                      <input
                        type="number" min="1" step="1"
                        value={t.party_size}
                        onChange={(e) => updateLocal(t.id, { party_size: parseInt(e.target.value) || 1 })}
                        onBlur={() => saveTraveler(t.id)}
                        className="input font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-forest/50 mb-0.5">Custom % weight</label>
                      <input
                        type="number" min="0" step="0.5"
                        value={t.custom_weight}
                        onChange={(e) => updateLocal(t.id, { custom_weight: parseFloat(e.target.value) || 1 })}
                        onBlur={() => saveTraveler(t.id)}
                        className="input font-mono text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={t.pay_app ?? ''}
                      onChange={(e) => {
                        const v = (e.target.value || null) as PayApp | null
                        updateLocal(t.id, { pay_app: v })
                        // select has no blur on mobile — persist right away
                        setTimeout(() => saveTraveler(t.id), 0)
                      }}
                      className="input text-sm w-32"
                    >
                      <option value="">Pay app…</option>
                      {PAY_APPS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={t.pay_handle ?? ''}
                      onChange={(e) => updateLocal(t.id, { pay_handle: e.target.value })}
                      onBlur={() => saveTraveler(t.id)}
                      placeholder="username (no @ or $)"
                      className="input text-sm flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={t.email ?? ''}
                      onChange={(e) => updateLocal(t.id, { email: e.target.value })}
                      onBlur={() => saveTraveler(t.id)}
                      placeholder="email (optional — auto-claims their spot)"
                      className="input text-sm flex-1"
                      disabled={!!t.user_id}
                    />
                    {t.user_id && (
                      <span className="text-xs text-sage font-medium shrink-0" title="This traveler has claimed their spot">
                        ✓ joined
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {rows.length < MAX_TRAVELERS && (
              <button onClick={addTraveler} className="btn-secondary w-full text-sm mt-2">
                + Add traveler
              </button>
            )}
          </div>

          {/* Share with the group — the actual switch lives in the Guest
              Sharing tab list below, alongside Days/Route/etc. */}
          <div className="pt-3 border-t border-forest/10">
            {shareSplit && trip.share_enabled ? (
              <p className="text-xs text-forest/40">
                ✓ Split is shared — travelers open your guest link and log in (free) to
                claim their spot, add expenses, and mark themselves settled. They never
                pay for the app.
              </p>
            ) : (
              <p className="text-xs text-gold">
                To let the group join, {!trip.share_enabled && 'turn on "Share link enabled" and '}
                check <span className="font-medium">💸 Split</span> in Guest Sharing below.
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-terracotta bg-terracotta/10 rounded-lg px-3 py-2 mt-3">{error}</p>
      )}
    </div>
  )
}
