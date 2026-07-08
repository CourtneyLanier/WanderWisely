import { useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useTrip } from '@/hooks/useTrip'
import type { Budget, SpendingLog, Reservation, Trip } from '@/types'

// ── helpers ────────────────────────────────────────────────────────────────────

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayStr() { return ymd(new Date()) }
function logDate(log: SpendingLog) { return ymd(new Date(log.logged_at)) }

function dollar(n: number) {
  const abs = Math.abs(n)
  return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Convert a YYYY-MM-DD date string to an ISO timestamptz using local noon,
 *  so logDate() will always read back the same date regardless of timezone. */
function dateToLoggedAt(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toISOString()
}

// ── ReceiptScanFlow ────────────────────────────────────────────────────────────

type ScanStep = 'idle' | 'scanning' | 'review' | 'error'
type ReceiptCard = 'food' | 'car' | 'hotel' | 'misc'

const CARD_OPTIONS: Array<{ value: ReceiptCard; label: string }> = [
  { value: 'food', label: 'Food' },
  { value: 'car', label: 'Car / Gas' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'misc', label: 'Miscellaneous' },
]

interface SplitRow {
  label: string
  amount: string
  card: ReceiptCard
}

interface ParsedReceiptItem {
  label: string | null
  amount: number | null
  card: ReceiptCard | null
}

/** The edge function returns { date, items: [...] }; older deployments returned a
 *  single flat { label, amount, card, date }. Normalize both into split rows. */
function parsedToRows(json: unknown, defaultCard: ReceiptCard): SplitRow[] {
  const obj = (json ?? {}) as Record<string, unknown>
  const items: ParsedReceiptItem[] = Array.isArray(obj.items)
    ? (obj.items as ParsedReceiptItem[])
    : [obj as unknown as ParsedReceiptItem]
  const rows = items
    .filter((it) => it && (it.label != null || it.amount != null))
    .map((it) => ({
      label: it.label ?? '',
      amount: it.amount != null ? String(it.amount) : '',
      card: it.card && CARD_OPTIONS.some((o) => o.value === it.card) ? it.card : defaultCard,
    }))
  return rows.length > 0 ? rows : [{ label: '', amount: '', card: defaultCard }]
}

function ReceiptScanFlow({
  defaultCard,
  tripId,
  onSaved,
  onCancel,
}: {
  defaultCard: ReceiptCard
  tripId: string
  onSaved: () => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<ScanStep>('idle')
  const [rows, setRows] = useState<SplitRow[]>([{ label: '', amount: '', card: defaultCard }])
  const [date, setDate] = useState(todayStr())
  const [error, setError] = useState('')

  async function handleFile(file: File) {
    setStep('scanning')
    setError('')
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

      const { data: fnData, error: fnError } = await supabase.functions.invoke('parse-with-claude', {
        body: { mode: 'receipt', imageBase64: base64, mediaType },
      })
      if (fnError) throw fnError
      if (!fnData?.ok) throw new Error(fnData?.error ?? 'Unknown error')
      const text = fnData.text as string
      const raw = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const json = JSON.parse(raw) as { date?: string | null }

      setRows(parsedToRows(json, defaultCard))
      // Use parsed date if present and valid, otherwise keep today
      if (json.date && /^\d{4}-\d{2}-\d{2}$/.test(json.date)) setDate(json.date)
      setStep('review')
    } catch (e) {
      setError((e as Error).message ?? 'Unknown error')
      setStep('error')
    }
  }

  function updateRow(index: number, patch: Partial<SplitRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const rowsValid = rows.length > 0 && rows.every((r) => r.amount !== '' && parseFloat(r.amount) > 0)
  const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('spending_log').insert(
        rows.map((r) => ({
          trip_id: tripId,
          card: r.card,
          amount: parseFloat(r.amount),
          label: r.label.trim() || null,
          entry_type: 'per_meal' as const,
          logged_at: dateToLoggedAt(date),
        }))
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spending_log', tripId] })
      onSaved()
    },
  })

  if (step === 'idle') {
    return (
      <div className="space-y-3">
        <p className="font-display text-lg text-forest">Scan a Receipt</p>
        <p className="text-sm text-forest/60">Take a photo or upload an image of your receipt.</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} className="btn-primary flex-1">
            📷 Take Photo
          </button>
          <button onClick={onCancel} className="btn-secondary px-4">Cancel</button>
        </div>
        <button
          onClick={() => {
            if (fileRef.current) {
              fileRef.current.removeAttribute('capture')
              fileRef.current.click()
              fileRef.current.setAttribute('capture', 'environment')
            }
          }}
          className="text-xs text-forest/40 underline w-full text-center"
        >
          or choose from library
        </button>
      </div>
    )
  }

  if (step === 'scanning') {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-3xl animate-pulse">🧾</p>
        <p className="text-sm text-forest/60">Reading your receipt…</p>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="space-y-3">
        <p className="font-display text-lg text-forest">Scan failed</p>
        <p className="text-sm text-terracotta">{error}</p>
        <div className="flex gap-2">
          <button onClick={() => setStep('idle')} className="btn-primary flex-1">Try again</button>
          <button onClick={onCancel} className="btn-secondary px-4">Cancel</button>
        </div>
      </div>
    )
  }

  // review step
  return (
    <div className="space-y-3">
      <p className="font-display text-lg text-forest">Review & Save</p>
      {rows.length > 1 && (
        <p className="text-xs text-forest/50">
          This receipt was split into {rows.length} categories — adjust anything before saving.
        </p>
      )}

      {rows.map((row, i) => (
        <div key={i} className="rounded-lg border border-forest/10 bg-white/50 p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={row.label}
              onChange={(e) => updateRow(i, { label: e.target.value })}
              placeholder="e.g. Shell – Gas"
              className="input flex-1"
              autoFocus={i === 0}
            />
            {rows.length > 1 && (
              <button
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                className="text-terracotta/50 hover:text-terracotta text-xs leading-none px-1"
                title="Remove this line"
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              value={row.amount}
              onChange={(e) => updateRow(i, { amount: e.target.value })}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="input font-mono w-28"
            />
            <select
              value={row.card}
              onChange={(e) => updateRow(i, { card: e.target.value as ReceiptCard })}
              className="input flex-1"
            >
              {CARD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      ))}

      <button
        onClick={() => setRows((prev) => [...prev, { label: '', amount: '', card: defaultCard }])}
        className="text-xs text-sage hover:text-forest transition-colors"
      >
        + Split into another category
      </button>

      {rows.length > 1 && (
        <p className="text-xs text-forest/50 font-mono">
          Total: ${total.toFixed(2)}
        </p>
      )}

      <div>
        <label className="block text-sm text-forest mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={todayStr()}
          className="input"
        />
      </div>
      {saveMutation.isError && (
        <p className="text-xs text-terracotta">{(saveMutation.error as Error).message}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !rowsValid}
          className="btn-primary flex-1"
        >
          {saveMutation.isPending
            ? 'Saving…'
            : rows.length > 1 ? `Save ${rows.length} entries` : 'Save'}
        </button>
        <button onClick={() => setStep('idle')} className="btn-secondary px-3">Retake</button>
        <button onClick={onCancel} className="btn-secondary px-3">✕</button>
      </div>
    </div>
  )
}

// ── FoodCard ───────────────────────────────────────────────────────────────────

function FoodCard({
  budget,
  logs,
  tripId,
  trip,
}: {
  budget: Budget
  logs: SpendingLog[]
  tripId: string
  trip: Trip | null | undefined
}) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'meal' | 'total' | 'scan' | null>(null)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())

  const foodLogs = useMemo(
    () => logs.filter((l) => l.card === 'food'),
    [logs]
  )
  const today = todayStr()
  const baseline = budget.food_days > 0 ? budget.food_total / budget.food_days : 0

  const byDate = useMemo(() => {
    const map: Record<string, number> = {}
    for (const l of foodLogs) {
      const d = logDate(l)
      map[d] = (map[d] ?? 0) + l.amount
    }
    return map
  }, [foodLogs])

  const todaySpent = byDate[today] ?? 0
  const totalSpent = foodLogs.reduce((s, l) => s + l.amount, 0)
  const remaining = budget.food_total - totalSpent
  const hasBudget = budget.food_total > 0

  // Cushion: how much ahead/behind we are vs. expected spend for elapsed trip days.
  // Uses real elapsed days so that days with no entries still count toward the budget.
  const cushion = useMemo(() => {
    if (!trip?.start_date || baseline <= 0) {
      // Fallback: sum per-day deltas when we don't have a start date
      return Object.values(byDate).reduce((sum, dayTotal) => sum + (baseline - dayTotal), 0)
    }
    const start = new Date(trip.start_date + 'T00:00:00')
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const daysPassed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    // daysElapsed includes today (day 1 = first day of trip), capped at food_days
    const daysElapsed = Math.max(0, Math.min(budget.food_days, daysPassed + 1))
    const expectedSoFar = daysElapsed * baseline
    return expectedSoFar - totalSpent
  }, [byDate, baseline, totalSpent, trip, budget.food_days])

  const todayLogs = useMemo(
    () => foodLogs.filter((l) => logDate(l) === today).sort((a, b) => b.logged_at.localeCompare(a.logged_at)),
    [foodLogs, today]
  )
  const recentLogs = useMemo(
    () => foodLogs.filter((l) => logDate(l) !== today).sort((a, b) => b.logged_at.localeCompare(a.logged_at)).slice(0, 6),
    [foodLogs, today]
  )

  const cushionPositive = cushion > 50
  const cushionWarn = cushion >= -50 && cushion <= 50
  const cushionColor = cushionPositive ? 'text-sage' : cushionWarn ? 'text-gold' : 'text-terracotta'
  const barColor = cushionPositive ? 'bg-sage' : cushionWarn ? 'bg-gold' : 'bg-terracotta'
  const barPct = budget.food_total > 0 ? Math.min(100, Math.max(0, (remaining / budget.food_total) * 100)) : 0

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('spending_log').insert({
        trip_id: tripId,
        card: 'food',
        amount: parseFloat(amount),
        label: label.trim() || null,
        entry_type: mode === 'total' ? 'daily_total' : 'per_meal',
        logged_at: dateToLoggedAt(date),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spending_log', tripId] })
      setMode(null)
      setLabel('')
      setAmount('')
      setDate(todayStr())
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('spending_log').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['spending_log', tripId] }),
  })

  function cancelAdd() {
    setMode(null)
    setLabel('')
    setAmount('')
    setDate(todayStr())
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
            <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
            <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
          </svg>
          <p className="font-display text-lg text-forest">Food</p>
        </div>
        {hasBudget ? (
          <div className={`text-sm font-mono font-semibold ${cushionColor}`}>
            {cushion >= 0 ? '+' : ''}{dollar(Math.round(cushion))} cushion
          </div>
        ) : (
          <div className="text-sm font-mono font-semibold text-forest/60">
            {dollar(Math.round(totalSpent))} total
          </div>
        )}
      </div>

      {/* Progress bar + stats — only when a food budget is set */}
      {hasBudget ? (
        <>
          <div className="h-2 bg-forest/10 rounded-full mb-4 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${barPct}%` }} />
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4 text-center">
            <div className="card-inset py-2.5 px-1">
              <p className="text-xs text-forest/50 mb-0.5">Per day</p>
              <p className="font-mono text-sm font-medium text-forest">{dollar(Math.round(baseline))}</p>
            </div>
            <div className="card-inset py-2.5 px-1">
              <p className="text-xs text-forest/50 mb-0.5">Today</p>
              <p className={`font-mono text-sm font-medium ${todaySpent > baseline && baseline > 0 ? 'text-terracotta' : 'text-forest'}`}>
                {dollar(todaySpent)}
              </p>
            </div>
            <div className="card-inset py-2.5 px-1">
              <p className="text-xs text-forest/50 mb-0.5">Remaining</p>
              <p className={`font-mono text-sm font-medium ${remaining < 0 ? 'text-terracotta' : 'text-forest'}`}>
                {dollar(Math.round(remaining))}
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-4 text-center">
          <div className="card-inset py-2.5 px-1">
            <p className="text-xs text-forest/50 mb-0.5">Today</p>
            <p className="font-mono text-sm font-medium text-forest">{dollar(todaySpent)}</p>
          </div>
          <div className="card-inset py-2.5 px-1">
            <p className="text-xs text-forest/50 mb-0.5">Total spent</p>
            <p className="font-mono text-sm font-medium text-forest">{dollar(Math.round(totalSpent))}</p>
          </div>
        </div>
      )}

      {/* Today's entries */}
      {todayLogs.length > 0 && (
        <div className="mb-3">
          <p className="section-label mb-1.5">Today</p>
          <div className="space-y-1.5">
            {todayLogs.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm">
                <span className="text-forest truncate flex-1 mr-2">
                  {l.label || (l.entry_type === 'daily_total' ? 'Day total' : 'Meal')}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-forest">{dollar(l.amount)}</span>
                  <button onClick={() => deleteMutation.mutate(l.id)}
                    className="text-terracotta/50 hover:text-terracotta text-xs leading-none">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scan receipt flow */}
      {mode === 'scan' && (
        <div className="bg-cream rounded-lg p-3 mb-3 border border-forest/10">
          <ReceiptScanFlow
            defaultCard="food"
            tripId={tripId}
            onSaved={() => setMode(null)}
            onCancel={() => setMode(null)}
          />
        </div>
      )}

      {/* Add entry form */}
      {(mode === 'meal' || mode === 'total') && (
        <div className="bg-cream rounded-lg p-3 mb-3 space-y-2 border border-forest/10">
          <p className="text-xs font-medium text-forest/50 uppercase tracking-wide">
            {mode === 'meal' ? 'Log a meal' : "Log today's total"}
          </p>
          {mode === 'meal' && (
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Breakfast – McDonald's"
              className="input"
              autoFocus
            />
          )}
          <div className="flex gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="$0"
              min="0"
              step="0.01"
              className="input font-mono flex-1"
              autoFocus={mode === 'total'}
            />
            <button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !amount || parseFloat(amount) <= 0}
              className="btn-primary px-4"
            >
              {addMutation.isPending ? '…' : 'Save'}
            </button>
            <button onClick={cancelAdd} className="btn-secondary px-3">✕</button>
          </div>
          <div>
            <label className="block text-xs text-forest/50 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayStr()}
              className="input text-sm"
            />
          </div>
          {addMutation.isError && (
            <p className="text-xs text-terracotta">{(addMutation.error as Error).message}</p>
          )}
        </div>
      )}

      {/* Action buttons */}
      {!mode && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setMode('meal')} className="btn-secondary flex-1 text-xs py-2">
            + Meal
          </button>
          <button onClick={() => setMode('total')} className="btn-secondary flex-1 text-xs py-2">
            Log day total
          </button>
          <button onClick={() => setMode('scan')} className="btn-secondary flex-1 text-xs py-2">
            📷 Scan receipt
          </button>
        </div>
      )}

      {/* Recent past entries */}
      {recentLogs.length > 0 && (
        <div className="mt-4 pt-3 border-t border-forest/10 space-y-1.5">
          <p className="section-label mb-1.5">Recent</p>
          {recentLogs.map((l) => (
            <div key={l.id} className="flex items-center justify-between text-xs text-forest/50">
              <span className="truncate flex-1 mr-2">
                {l.label || (l.entry_type === 'daily_total' ? 'Day total' : 'Meal')}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono">{dollar(l.amount)}</span>
                <span>{shortDate(l.logged_at)}</span>
                <button onClick={() => deleteMutation.mutate(l.id)}
                  className="text-terracotta/50 hover:text-terracotta">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── HotelCard ──────────────────────────────────────────────────────────────────

function fmtResDate(s: string | null) {
  if (!s) return null
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function HotelCard({
  logs,
  tripId,
  hotelReservations,
}: {
  logs: SpendingLog[]
  tripId: string
  hotelReservations: Reservation[]
}) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState<false | 'manual' | 'scan'>(false)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  // Inline cost editing on a reservation
  const [editingCostId, setEditingCostId] = useState<string | null>(null)
  const [editCostValue, setEditCostValue] = useState('')

  const hotelLogs = useMemo(
    () => logs.filter((l) => l.card === 'hotel').sort((a, b) => b.logged_at.localeCompare(a.logged_at)),
    [logs]
  )

  const totalBooked = useMemo(
    () => hotelReservations.reduce((s, r) => s + (r.cost ?? 0), 0),
    [hotelReservations]
  )

  const paidViaReservations = useMemo(
    () => hotelReservations.filter((r) => r.paid).reduce((s, r) => s + (r.cost ?? 0), 0),
    [hotelReservations]
  )
  const paidViaLogs = useMemo(() => hotelLogs.reduce((s, l) => s + l.amount, 0), [hotelLogs])
  const totalPaid = paidViaReservations + paidViaLogs
  const outstanding = totalBooked - totalPaid
  const pct = totalBooked > 0 ? Math.min(100, (totalPaid / totalBooked) * 100) : 0
  const overPaid = totalPaid > totalBooked && totalBooked > 0

  const togglePaidMutation = useMutation({
    mutationFn: async ({ id, paid, label }: { id: string; paid: boolean; cost: number | null; label: string }) => {
      const { error } = await supabase.from('reservations').update({ paid }).eq('id', id)
      if (error) throw error
      if (!paid) {
        await supabase.from('spending_log')
          .delete()
          .eq('trip_id', tripId)
          .eq('card', 'hotel')
          .eq('label', `Paid: ${label}`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel-reservations-budget', tripId] })
      queryClient.invalidateQueries({ queryKey: ['spending_log', tripId] })
    },
  })

  const updateCostMutation = useMutation({
    mutationFn: async ({ id, cost }: { id: string; cost: number }) => {
      const { error } = await supabase.from('reservations').update({ cost }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel-reservations-budget', tripId] })
      setEditingCostId(null)
      setEditCostValue('')
    },
  })

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const hotelNames = hotelReservations.map((r) => r.title || r.provider || '').filter(Boolean)
      const { error } = await supabase.from('spending_log')
        .delete()
        .eq('trip_id', tripId)
        .eq('card', 'hotel')
        .or([
          'label.like.Paid: %',
          ...hotelNames.map((n) => `label.eq.${n}`),
        ].join(','))
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spending_log', tripId] })
    },
  })

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('spending_log').insert({
        trip_id: tripId,
        card: 'hotel',
        amount: parseFloat(amount),
        label: label.trim() || null,
        entry_type: 'per_meal',
        logged_at: dateToLoggedAt(date),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spending_log', tripId] })
      setAdding(false)
      setLabel('')
      setAmount('')
      setDate(todayStr())
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('spending_log').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['spending_log', tripId] }),
  })

  function cancelAdd() { setAdding(false); setLabel(''); setAmount(''); setDate(todayStr()) }

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <p className="font-display text-lg text-forest">Hotel</p>
      </div>

      {totalBooked > 0 && (
        <>
          {/* Progress bar */}
          <div className="h-2 bg-forest/10 rounded-full mb-4 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${overPaid ? 'bg-sage' : 'bg-gold'}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-4 text-center">
            <div className="card-inset py-2.5 px-1">
              <p className="text-xs text-forest/50 mb-0.5">Total booked</p>
              <p className="font-mono text-sm font-medium text-forest">{dollar(Math.round(totalBooked))}</p>
            </div>
            <div className="card-inset py-2.5 px-1">
              <p className="text-xs text-forest/50 mb-0.5">Paid</p>
              <p className="font-mono text-sm font-medium text-sage">{dollar(Math.round(totalPaid))}</p>
            </div>
            <div className="card-inset py-2.5 px-1">
              <p className="text-xs text-forest/50 mb-0.5">Still owed</p>
              <p className={`font-mono text-sm font-medium ${outstanding > 0 ? 'text-terracotta' : 'text-sage'}`}>
                {outstanding > 0 ? dollar(Math.round(outstanding)) : '✓ Paid off'}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Hotel reservations — per-reservation mark paid + inline cost edit */}
      {hotelReservations.length > 0 && (
        <div className="mb-3 space-y-2">
          <p className="section-label mb-1.5">Hotels</p>
          {hotelReservations.map((r) => {
            const resLabel = r.title || r.provider || 'Hotel'
            const isEditingCost = editingCostId === r.id
            return (
              <div
                key={r.id}
                className={`rounded-lg px-3 py-2.5 border transition-colors ${
                  r.paid ? 'bg-sage/8 border-sage/20' : 'bg-forest/[0.03] border-forest/8'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-forest truncate">{resLabel}</span>
                      {r.paid && <span className="text-xs text-sage font-medium shrink-0">✓ Paid</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {r.date && <span className="text-xs text-forest/40">{fmtResDate(r.date)}</span>}
                      {/* Inline cost edit */}
                      {isEditingCost ? (
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-xs text-forest/40">$</span>
                          <input
                            type="number"
                            value={editCostValue}
                            onChange={(e) => setEditCostValue(e.target.value)}
                            className="input font-mono text-xs py-0.5 w-24"
                            min="0"
                            step="0.01"
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              const cost = parseFloat(editCostValue)
                              if (!isNaN(cost) && cost >= 0) updateCostMutation.mutate({ id: r.id, cost })
                            }}
                            disabled={updateCostMutation.isPending}
                            className="text-xs text-sage font-medium px-1"
                          >
                            {updateCostMutation.isPending ? '…' : '✓'}
                          </button>
                          <button
                            onClick={() => { setEditingCostId(null); setEditCostValue('') }}
                            className="text-xs text-forest/40 px-1"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        r.cost != null && (
                          <button
                            onClick={() => { setEditingCostId(r.id); setEditCostValue(String(r.cost)) }}
                            className="font-mono text-xs text-gold hover:text-forest transition-colors flex items-center gap-1"
                            title="Edit cost"
                          >
                            {dollar(r.cost)}
                            <span className="text-forest/30 text-xs">✎</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => togglePaidMutation.mutate({
                      id: r.id,
                      paid: !r.paid,
                      cost: r.cost,
                      label: resLabel,
                    })}
                    disabled={togglePaidMutation.isPending}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                      r.paid
                        ? 'bg-forest/10 text-forest/50 hover:bg-terracotta/10 hover:text-terracotta'
                        : 'bg-sage text-white hover:bg-sage/80'
                    }`}
                  >
                    {r.paid ? 'Undo' : 'Mark paid'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {hotelReservations.length === 0 && totalBooked === 0 && (
        <p className="text-xs text-forest/40 mb-3">
          Upload hotel reservation PDFs to Wallet to track costs here automatically.
        </p>
      )}

      {/* Scan receipt flow */}
      {adding === 'scan' && (
        <div className="bg-cream rounded-lg p-3 mb-3 border border-forest/10">
          <ReceiptScanFlow
            defaultCard="hotel"
            tripId={tripId}
            onSaved={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {/* Manual payment log */}
      {adding === 'manual' && (
        <div className="bg-cream rounded-lg p-3 mb-3 space-y-2 border border-forest/10">
          <p className="text-xs font-medium text-forest/50 uppercase tracking-wide">Log a partial payment or deposit</p>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Hampton Inn – deposit"
            className="input"
            autoFocus
          />
          <div className="flex gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="$0"
              min="0"
              step="0.01"
              className="input font-mono flex-1"
            />
            <button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !amount || parseFloat(amount) <= 0}
              className="btn-primary px-4"
            >
              {addMutation.isPending ? '…' : 'Save'}
            </button>
            <button onClick={cancelAdd} className="btn-secondary px-3">✕</button>
          </div>
          <div>
            <label className="block text-xs text-forest/50 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayStr()}
              className="input text-sm"
            />
          </div>
          {addMutation.isError && (
            <p className="text-xs text-terracotta">{(addMutation.error as Error).message}</p>
          )}
        </div>
      )}

      {!adding && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button onClick={() => setAdding('manual')} className="btn-secondary flex-1 text-xs py-2">
              + Log payment / deposit
            </button>
            <button onClick={() => setAdding('scan')} className="btn-secondary flex-1 text-xs py-2">
              📷 Scan receipt
            </button>
          </div>
          <button
            onClick={() => recalcMutation.mutate()}
            disabled={recalcMutation.isPending}
            className="w-full text-xs py-2 rounded-lg border border-forest/15 text-forest/50 hover:bg-forest/5 transition-colors"
          >
            {recalcMutation.isPending ? 'Recalculating…' : '↻ Recalculate totals'}
          </button>
        </div>
      )}

      {/* Manual payment history */}
      {hotelLogs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-forest/10 space-y-1.5">
          <p className="section-label mb-1.5">Manual payments</p>
          {hotelLogs.map((l) => (
            <div key={l.id} className="flex items-center justify-between text-sm">
              <span className="text-forest truncate flex-1 mr-2">{l.label || 'Hotel payment'}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-forest">{dollar(l.amount)}</span>
                <span className="text-xs text-forest/40">{shortDate(l.logged_at)}</span>
                <button onClick={() => deleteMutation.mutate(l.id)}
                  className="text-terracotta/50 hover:text-terracotta text-xs leading-none">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── CarCard ────────────────────────────────────────────────────────────────────

function CarCard({ budget, logs, tripId }: { budget: Budget; logs: SpendingLog[]; tripId: string }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState<'manual' | 'scan' | false>(false)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())

  const carLogs = useMemo(
    () => logs.filter((l) => l.card === 'car').sort((a, b) => b.logged_at.localeCompare(a.logged_at)),
    [logs]
  )

  const totalSpent = carLogs.reduce((s, l) => s + l.amount, 0)
  const hasBudget = budget.car_total_budget > 0
  const remaining = budget.car_total_budget - totalSpent
  const overBudget = hasBudget && totalSpent > budget.car_total_budget
  const pct = hasBudget ? Math.min(100, (totalSpent / budget.car_total_budget) * 100) : 0

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('spending_log').insert({
        trip_id: tripId,
        card: 'car',
        amount: parseFloat(amount),
        label: label.trim() || null,
        entry_type: 'per_meal',
        logged_at: dateToLoggedAt(date),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spending_log', tripId] })
      setAdding(false)
      setLabel('')
      setAmount('')
      setDate(todayStr())
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('spending_log').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['spending_log', tripId] }),
  })

  function cancelAdd() { setAdding(false); setLabel(''); setAmount(''); setDate(todayStr()) }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
            <rect x="1" y="3" width="15" height="13" rx="2"/>
            <path d="M16 8h4l3 5v3h-7V8z"/>
            <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
          </svg>
          <p className="font-display text-lg text-forest">Car / Gas</p>
        </div>
        <div className={`text-sm font-mono font-semibold ${overBudget ? 'text-terracotta' : 'text-forest/60'}`}>
          {hasBudget
            ? `${dollar(Math.round(totalSpent))} / ${dollar(budget.car_total_budget)}`
            : `${dollar(Math.round(totalSpent))} total`}
        </div>
      </div>

      {/* Progress bar + stats — only when a car budget is set */}
      {hasBudget && (
        <>
          <div className="h-2 bg-forest/10 rounded-full mb-4 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${overBudget ? 'bg-terracotta' : 'bg-gold'}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="card-inset p-3">
              <p className="text-xs text-forest/50 mb-1">Budget ceiling</p>
              <p className="font-mono text-sm font-semibold text-forest">{dollar(budget.car_total_budget)}</p>
            </div>
            <div className="card-inset p-3">
              <p className="text-xs text-forest/50 mb-1">Remaining</p>
              <p className={`font-mono text-sm font-semibold ${overBudget ? 'text-terracotta' : 'text-forest'}`}>
                {dollar(Math.round(remaining))}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Scan receipt flow */}
      {adding === 'scan' && (
        <div className="bg-cream rounded-lg p-3 mb-3 border border-forest/10">
          <ReceiptScanFlow
            defaultCard="car"
            tripId={tripId}
            onSaved={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {/* Manual add form */}
      {adding === 'manual' && (
        <div className="bg-cream rounded-lg p-3 mb-3 space-y-2 border border-forest/10">
          <p className="text-xs font-medium text-forest/50 uppercase tracking-wide">Log gas / expense</p>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Gas – Flagstaff, AZ"
            className="input"
            autoFocus
          />
          <div className="flex gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="$0"
              min="0"
              step="0.01"
              className="input font-mono flex-1"
            />
            <button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !amount || parseFloat(amount) <= 0}
              className="btn-primary px-4"
            >
              {addMutation.isPending ? '…' : 'Save'}
            </button>
            <button onClick={cancelAdd} className="btn-secondary px-3">✕</button>
          </div>
          <div>
            <label className="block text-xs text-forest/50 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayStr()}
              className="input text-sm"
            />
          </div>
          {addMutation.isError && (
            <p className="text-xs text-terracotta">{(addMutation.error as Error).message}</p>
          )}
        </div>
      )}

      {!adding && (
        <div className="flex gap-2">
          <button onClick={() => setAdding('manual')} className="btn-secondary flex-1 text-xs py-2">
            + Log expense
          </button>
          <button onClick={() => setAdding('scan')} className="btn-secondary flex-1 text-xs py-2">
            📷 Scan receipt
          </button>
        </div>
      )}

      {/* Entries list */}
      {carLogs.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {carLogs.slice(0, 8).map((l) => (
            <div key={l.id} className="flex items-center justify-between text-sm">
              <span className="text-forest truncate flex-1 mr-2">{l.label || 'Gas'}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-forest">{dollar(l.amount)}</span>
                <span className="text-xs text-forest/40">{shortDate(l.logged_at)}</span>
                <button onClick={() => deleteMutation.mutate(l.id)}
                  className="text-terracotta/50 hover:text-terracotta text-xs leading-none">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MiscCard ───────────────────────────────────────────────────────────────────

function MiscCard({ budget, logs, tripId }: { budget: Budget; logs: SpendingLog[]; tripId: string }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState<'manual' | 'scan' | false>(false)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())

  const miscLogs = useMemo(
    () => logs.filter((l) => l.card === 'misc').sort((a, b) => b.logged_at.localeCompare(a.logged_at)),
    [logs]
  )

  const totalSpent = miscLogs.reduce((s, l) => s + l.amount, 0)
  const miscBudget = budget.misc_total_budget
  const hasBudget = miscBudget != null && miscBudget > 0
  const remaining = hasBudget ? miscBudget - totalSpent : 0
  const overBudget = hasBudget && totalSpent > miscBudget
  const pct = hasBudget ? Math.min(100, (totalSpent / miscBudget) * 100) : 0

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('spending_log').insert({
        trip_id: tripId,
        card: 'misc',
        amount: parseFloat(amount),
        label: label.trim() || null,
        entry_type: 'per_meal',
        logged_at: dateToLoggedAt(date),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spending_log', tripId] })
      setAdding(false)
      setLabel('')
      setAmount('')
      setDate(todayStr())
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('spending_log').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['spending_log', tripId] }),
  })

  function cancelAdd() { setAdding(false); setLabel(''); setAmount(''); setDate(todayStr()) }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
          <p className="font-display text-lg text-forest">Miscellaneous</p>
        </div>
        <div className={`text-sm font-mono font-semibold ${overBudget ? 'text-terracotta' : 'text-forest/60'}`}>
          {hasBudget
            ? `${dollar(Math.round(totalSpent))} / ${dollar(miscBudget)}`
            : `${dollar(Math.round(totalSpent))} total`}
        </div>
      </div>

      {/* Progress bar + stats — only when a misc budget is set */}
      {hasBudget && (
        <>
          <div className="h-2 bg-forest/10 rounded-full mb-4 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${overBudget ? 'bg-terracotta' : 'bg-gold'}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="card-inset p-3">
              <p className="text-xs text-forest/50 mb-1">Budget ceiling</p>
              <p className="font-mono text-sm font-semibold text-forest">{dollar(miscBudget)}</p>
            </div>
            <div className="card-inset p-3">
              <p className="text-xs text-forest/50 mb-1">Remaining</p>
              <p className={`font-mono text-sm font-semibold ${overBudget ? 'text-terracotta' : 'text-forest'}`}>
                {dollar(Math.round(remaining))}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Scan receipt flow */}
      {adding === 'scan' && (
        <div className="bg-cream rounded-lg p-3 mb-3 border border-forest/10">
          <ReceiptScanFlow
            defaultCard="misc"
            tripId={tripId}
            onSaved={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {/* Manual add form */}
      {adding === 'manual' && (
        <div className="bg-cream rounded-lg p-3 mb-3 space-y-2 border border-forest/10">
          <p className="text-xs font-medium text-forest/50 uppercase tracking-wide">Log misc expense</p>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Souvenir, park entry, etc."
            className="input"
            autoFocus
          />
          <div className="flex gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="$0"
              min="0"
              step="0.01"
              className="input font-mono flex-1"
            />
            <button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !amount || parseFloat(amount) <= 0}
              className="btn-primary px-4"
            >
              {addMutation.isPending ? '…' : 'Save'}
            </button>
            <button onClick={cancelAdd} className="btn-secondary px-3">✕</button>
          </div>
          <div>
            <label className="block text-xs text-forest/50 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayStr()}
              className="input text-sm"
            />
          </div>
          {addMutation.isError && (
            <p className="text-xs text-terracotta">{(addMutation.error as Error).message}</p>
          )}
        </div>
      )}

      {!adding && (
        <div className="flex gap-2">
          <button onClick={() => setAdding('manual')} className="btn-secondary flex-1 text-xs py-2">
            + Log expense
          </button>
          <button onClick={() => setAdding('scan')} className="btn-secondary flex-1 text-xs py-2">
            📷 Scan receipt
          </button>
        </div>
      )}

      {/* Entries list */}
      {miscLogs.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {miscLogs.slice(0, 10).map((l) => (
            <div key={l.id} className="flex items-center justify-between text-sm">
              <span className="text-forest truncate flex-1 mr-2">{l.label || 'Misc'}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-forest">{dollar(l.amount)}</span>
                <span className="text-xs text-forest/40">{shortDate(l.logged_at)}</span>
                <button onClick={() => deleteMutation.mutate(l.id)}
                  className="text-terracotta/50 hover:text-terracotta text-xs leading-none">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const tripId = useAppStore((s) => s.tripId)
  const { data: trip, isLoading: tripLoading } = useTrip()

  const activeTripId = trip?.id ?? tripId

  const { data: budget, isLoading: budgetLoading } = useQuery({
    queryKey: ['budget', activeTripId],
    queryFn: async (): Promise<Budget | null> => {
      const { data, error } = await supabase
        .from('budget').select('*').eq('trip_id', activeTripId!).maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!activeTripId,
  })

  const { data: logs = [] } = useQuery({
    queryKey: ['spending_log', activeTripId],
    queryFn: async (): Promise<SpendingLog[]> => {
      const { data, error } = await supabase
        .from('spending_log').select('*').eq('trip_id', activeTripId!).order('logged_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!activeTripId,
  })

  const { data: hotelReservations = [] } = useQuery({
    queryKey: ['hotel-reservations-budget', activeTripId],
    queryFn: async (): Promise<Reservation[]> => {
      const { data, error } = await supabase
        .from('reservations').select('*')
        .eq('trip_id', activeTripId!).eq('type', 'hotel')
        .order('date', { nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!activeTripId,
  })

  const currentTripDay = useMemo(() => {
    if (!trip?.start_date || !trip?.num_days) return null
    const start = new Date(trip.start_date + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0 || diff >= trip.num_days) return null
    return diff + 1
  }, [trip])

  if (tripLoading || (!!activeTripId && budgetLoading)) {
    return (
      <div className="p-4 pt-6 flex justify-center py-20">
        <p className="text-forest/40 text-sm">Loading…</p>
      </div>
    )
  }

  if (!budget || !activeTripId) {
    return (
      <div className="p-4 pt-6">
        <h1 className="font-display text-2xl text-forest mb-4">Budget</h1>
        <div className="card text-center py-12 space-y-3">
          <p className="text-forest/50 text-sm">No budget set up yet.</p>
          <Link to="/settings" className="btn-primary inline-block">Go to Settings</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 pt-6 pb-10">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="font-display text-2xl text-forest">Budget</h1>
        {currentTripDay && (
          <span className="text-xs text-forest/50 font-medium">
            Day {currentTripDay} of {trip?.num_days}
          </span>
        )}
      </div>

      <div className="space-y-4">
        <FoodCard budget={budget} logs={logs} tripId={activeTripId} trip={trip} />
        <HotelCard logs={logs} tripId={activeTripId} hotelReservations={hotelReservations} />
        <CarCard budget={budget} logs={logs} tripId={activeTripId} />
        <MiscCard budget={budget} logs={logs} tripId={activeTripId} />
      </div>
    </div>
  )
}
