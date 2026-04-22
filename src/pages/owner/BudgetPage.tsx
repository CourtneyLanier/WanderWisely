import { useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useTrip } from '@/hooks/useTrip'
import type { Budget, SpendingLog } from '@/types'

// ── ReceiptScanFlow ────────────────────────────────────────────────────────────

const RECEIPT_SYSTEM_PROMPT = `You are a receipt parser. Extract spending information from the receipt image and return ONLY valid JSON with no preamble or markdown.

Return this exact structure:
{
  "label": "string (merchant name and brief description, e.g. \"McDonald's – Breakfast\" or \"Shell – Gas\")",
  "amount": number,
  "card": "food or car"
}

card rules:
- "food" for restaurants, cafes, grocery stores, fast food, bars
- "car" for gas stations, parking, tolls, car washes, auto services

If a field cannot be determined, use null.`

type ScanStep = 'idle' | 'scanning' | 'review' | 'error'

interface ParsedReceipt {
  label: string | null
  amount: number | null
  card: 'food' | 'car' | null
}

function ReceiptScanFlow({
  defaultCard,
  tripId,
  onSaved,
  onCancel,
}: {
  defaultCard: 'food' | 'car'
  tripId: string
  onSaved: () => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<ScanStep>('idle')
  const [, setParsed] = useState<ParsedReceipt>({ label: null, amount: null, card: defaultCard })
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [card, setCard] = useState<'food' | 'car'>(defaultCard)
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

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY as string,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 256,
          system: RECEIPT_SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: 'Parse this receipt.' },
            ],
          }],
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
        throw new Error(err?.error?.message ?? res.statusText)
      }

      const data = await res.json()
      const text: string = data.content?.[0]?.text ?? ''
      const raw = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const json: ParsedReceipt = JSON.parse(raw)

      setParsed(json)
      setLabel(json.label ?? '')
      setAmount(json.amount != null ? String(json.amount) : '')
      setCard(json.card ?? defaultCard)
      setStep('review')
    } catch (e) {
      setError((e as Error).message ?? 'Unknown error')
      setStep('error')
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('spending_log').insert({
        trip_id: tripId,
        card,
        amount: parseFloat(amount),
        label: label.trim() || null,
        entry_type: 'per_meal',
      })
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
      <div>
        <label className="block text-sm text-forest mb-1">Description</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. McDonald's – Breakfast"
          className="input"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm text-forest mb-1">Amount ($)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          min="0"
          step="0.01"
          className="input font-mono"
        />
      </div>
      <div>
        <label className="block text-sm text-forest mb-1">Category</label>
        <select value={card} onChange={(e) => setCard(e.target.value as 'food' | 'car')} className="input">
          <option value="food">Food</option>
          <option value="car">Car / Gas</option>
        </select>
      </div>
      {saveMutation.isError && (
        <p className="text-xs text-terracotta">{(saveMutation.error as Error).message}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !amount || parseFloat(amount) <= 0}
          className="btn-primary flex-1"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => setStep('idle')} className="btn-secondary px-3">Retake</button>
        <button onClick={onCancel} className="btn-secondary px-3">✕</button>
      </div>
    </div>
  )
}

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

// ── FoodCard ───────────────────────────────────────────────────────────────────

function FoodCard({ budget, logs, tripId }: { budget: Budget; logs: SpendingLog[]; tripId: string }) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'meal' | 'total' | 'scan' | null>(null)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')

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
  const cushion = useMemo(
    () => Object.values(byDate).reduce((sum, dayTotal) => sum + (baseline - dayTotal), 0),
    [byDate, baseline]
  )

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
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spending_log', tripId] })
      setMode(null)
      setLabel('')
      setAmount('')
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
        <div className={`text-sm font-mono font-semibold ${cushionColor}`}>
          {cushion >= 0 ? '+' : ''}{dollar(Math.round(cushion))} cushion
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-forest/10 rounded-full mb-4 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${barPct}%` }} />
      </div>

      {/* Stats row */}
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

function HotelCard({ budget }: { budget: Budget }) {
  const bufferOk = budget.hotel_buffer >= 500

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <p className="font-display text-lg text-forest">Hotel</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="card-inset p-3">
          <p className="text-xs text-forest/50 mb-1">Total booked</p>
          <p className="font-mono text-base font-semibold text-forest">{dollar(budget.hotel_total)}</p>
        </div>
        <div className={`rounded-lg p-3 ${bufferOk ? 'bg-cream/70 border border-forest/[0.08]' : 'bg-terracotta/10 border border-terracotta/20'}`}>
          <p className="text-xs text-forest/50 mb-1">Deposit buffer</p>
          <p className={`font-mono text-base font-semibold ${bufferOk ? 'text-forest' : 'text-terracotta'}`}>
            {dollar(budget.hotel_buffer)}
          </p>
          {!bufferOk && <p className="text-xs text-terracotta mt-0.5">Below $500 — check deposits</p>}
        </div>
      </div>

      <p className="text-xs text-forest/40">
        Hotel totals are tracked in Settings. No per-night logging needed.
      </p>
    </div>
  )
}

// ── CarCard ────────────────────────────────────────────────────────────────────

function CarCard({ budget, logs, tripId }: { budget: Budget; logs: SpendingLog[]; tripId: string }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState<'manual' | 'scan' | false>(false)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')

  const carLogs = useMemo(
    () => logs.filter((l) => l.card === 'car').sort((a, b) => b.logged_at.localeCompare(a.logged_at)),
    [logs]
  )

  const totalSpent = carLogs.reduce((s, l) => s + l.amount, 0)
  const remaining = budget.car_total_budget - totalSpent
  const overBudget = totalSpent > budget.car_total_budget
  const pct = budget.car_total_budget > 0 ? Math.min(100, (totalSpent / budget.car_total_budget) * 100) : 0

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('spending_log').insert({
        trip_id: tripId,
        card: 'car',
        amount: parseFloat(amount),
        label: label.trim() || null,
        entry_type: 'per_meal',
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spending_log', tripId] })
      setAdding(false)
      setLabel('')
      setAmount('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('spending_log').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['spending_log', tripId] }),
  })

  function cancelAdd() { setAdding(false); setLabel(''); setAmount('') }

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
          {dollar(Math.round(totalSpent))} / {dollar(budget.car_total_budget)}
        </div>
      </div>

      {/* Progress bar */}
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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const tripId = useAppStore((s) => s.tripId)
  const { data: trip, isLoading: tripLoading } = useTrip()

  // Use trip?.id directly so the query isn't blocked by Zustand store timing
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
        <FoodCard budget={budget} logs={logs} tripId={activeTripId} />
        <HotelCard budget={budget} />
        <CarCard budget={budget} logs={logs} tripId={activeTripId} />
      </div>
    </div>
  )
}
