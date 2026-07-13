import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import SettleBanner from '@/components/split/SettleBanner'
import {
  computeBalances,
  settleUp,
  payLink,
  travelerStatus,
  groupMessage,
  categoryTotals,
  type StatusKind,
} from '@/lib/splitMath'
import type { Traveler, SplitExpense, SplitCategory, SplitMethod } from '@/types'

// The live Split dashboard (blueprint §8) — mirrors the spreadsheet's
// Expenses + Dashboard tabs. Shared between the owner tab and the member
// view; `mode` + RLS decide who can do what:
//   owner  — everything (edit/delete, mark anyone settled, log for anyone)
//   member — add expenses as themselves or a proxy, mark ONLY their own row
//            settled, everything else read-only. Never premium-gated (§12).

const CATEGORIES: SplitCategory[] = [
  'Lodging', 'Food', 'Transportation', 'Gas', 'Activities', 'Shopping', 'Other',
]

const METHODS: { value: SplitMethod; label: string }[] = [
  { value: 'even', label: 'Even' },
  { value: 'party_size', label: 'By party size' },
  { value: 'custom', label: 'Custom %' },
]

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtShort(iso: string | null) {
  if (!iso) return null
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const STATUS_STYLES: Record<StatusKind, string> = {
  settled: 'bg-forest/10 text-forest/50',
  paid: 'bg-sage/15 text-sage',
  owes: 'bg-gold/15 text-gold',
  due_soon: 'bg-gold/15 text-gold',
  due_today: 'bg-gold/25 text-gold',
  overdue: 'bg-terracotta/15 text-terracotta',
}

interface ExpenseForm {
  spent_on: string
  description: string
  category: SplitCategory
  paid_by: string
  amount: string
  split_method: SplitMethod
  shared_with: string[]
}

// Receipt scan → prefill the expense form. Calls the same parse-with-claude
// edge function as the solo Budget tab (which stays untouched, §16).
const RECEIPT_CARD_TO_CATEGORY: Record<string, SplitCategory> = {
  food: 'Food', car: 'Gas', hotel: 'Lodging', misc: 'Other',
}

export default function SplitDashboard({
  tripId,
  tripName,
  currency,
  deadline,
  mode,
  currentUserId,
}: {
  tripId: string
  tripName: string
  currency: string
  deadline: string | null
  mode: 'owner' | 'member'
  currentUserId: string | null
}) {
  const queryClient = useQueryClient()

  const { data: travelers = [], isLoading: travelersLoading } = useQuery({
    queryKey: ['travelers', tripId],
    queryFn: async (): Promise<Traveler[]> => {
      const { data, error } = await supabase
        .from('travelers').select('*').eq('trip_id', tripId).order('sort_order')
      if (error) throw error
      return (data ?? []) as Traveler[]
    },
    enabled: !!tripId,
  })

  const { data: expenses = [] } = useQuery({
    queryKey: ['split_expenses', tripId],
    queryFn: async (): Promise<SplitExpense[]> => {
      const { data, error } = await supabase
        .from('split_expenses').select('*').eq('trip_id', tripId)
      if (error) throw error
      return (data ?? []) as SplitExpense[]
    },
    enabled: !!tripId,
  })

  const myTraveler = useMemo(
    () => travelers.find((t) => t.user_id != null && t.user_id === currentUserId) ?? null,
    [travelers, currentUserId]
  )

  // Members may log for themselves or for proxy travelers (nobody-logs-in rows).
  const allowedPayers = useMemo(
    () => (mode === 'owner' ? travelers : travelers.filter((t) => t.user_id === currentUserId || t.user_id === null)),
    [mode, travelers, currentUserId]
  )

  // ── Log/edit expense form ──

  const emptyForm = (): ExpenseForm => ({
    spent_on: todayStr(),
    description: '',
    category: 'Food',
    paid_by: mode === 'member' && myTraveler ? myTraveler.id : '',
    amount: '',
    split_method: 'even',
    shared_with: travelers.map((t) => t.id), // default: everyone shares
  })

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ExpenseForm>(emptyForm())
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function openForm(e?: SplitExpense) {
    setScanError('')
    if (e) {
      setEditingId(e.id)
      setForm({
        spent_on: e.spent_on ?? todayStr(),
        description: e.description ?? '',
        category: (e.category as SplitCategory) ?? 'Other',
        paid_by: e.paid_by ?? '',
        amount: String(e.amount),
        split_method: e.split_method,
        shared_with: e.shared_with,
      })
    } else {
      setEditingId(null)
      setForm(emptyForm())
    }
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setForm(emptyForm())
    setScanError('')
  }

  const formValid =
    form.paid_by !== '' &&
    parseFloat(form.amount) > 0 &&
    form.shared_with.length > 0

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        spent_on: form.spent_on || null,
        description: form.description.trim() || null,
        category: form.category,
        paid_by: form.paid_by,
        amount: parseFloat(form.amount),
        split_method: form.split_method,
        shared_with: form.shared_with,
      }
      if (editingId) {
        const { error } = await supabase.from('split_expenses').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('split_expenses').insert({ trip_id: tripId, ...payload })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['split_expenses', tripId] })
      closeForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('split_expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['split_expenses', tripId] }),
  })

  const toggleSettledMutation = useMutation({
    mutationFn: async (t: Traveler) => {
      const { error } = await supabase.from('travelers').update({ settled: !t.settled }).eq('id', t.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['travelers', tripId] }),
  })

  // ── Receipt scan → prefill form ──

  async function handleReceiptFile(file: File) {
    setScanning(true)
    setScanError('')
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      const { data: fnData, error: fnError } = await supabase.functions.invoke('parse-with-claude', {
        body: { mode: 'receipt', imageBase64: base64, mediaType },
      })
      if (fnError) throw fnError
      if (!fnData?.ok) throw new Error(fnData?.error ?? 'Unknown error')
      const raw = (fnData.text as string).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const json = JSON.parse(raw) as {
        date?: string | null
        items?: { label: string | null; amount: number | null; card: string | null }[]
      }
      const items = Array.isArray(json.items) ? json.items : [json as never]
      const valid = items.filter((it) => it && it.amount != null)
      const total = valid.reduce((s, it) => s + (it.amount ?? 0), 0)
      const biggest = [...valid].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0]
      setForm((prev) => ({
        ...prev,
        amount: total > 0 ? String(Math.round(total * 100) / 100) : prev.amount,
        description: valid.map((it) => it.label).filter(Boolean).join(' + ') || prev.description,
        category: RECEIPT_CARD_TO_CATEGORY[biggest?.card ?? ''] ?? prev.category,
        spent_on: json.date && /^\d{4}-\d{2}-\d{2}$/.test(json.date) ? json.date : prev.spent_on,
      }))
    } catch (e) {
      setScanError((e as Error).message ?? 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  // ── Derived math ──

  const balances = useMemo(() => computeBalances(travelers, expenses), [travelers, expenses])
  const transfers = useMemo(() => settleUp(balances), [balances])
  const catTotals = useMemo(() => categoryTotals(expenses), [expenses])
  const totalSpend = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses])
  const message = useMemo(
    () => groupMessage(tripName, currency, deadline, balances),
    [tripName, currency, deadline, balances]
  )

  const sortedExpenses = useMemo(
    () =>
      [...expenses].sort((a, b) => {
        const d = (b.spent_on ?? '').localeCompare(a.spent_on ?? '')
        return d !== 0 ? d : b.created_at.localeCompare(a.created_at)
      }),
    [expenses]
  )

  const travelerById = useMemo(() => new Map(travelers.map((t) => [t.id, t])), [travelers])

  const [copied, setCopied] = useState(false)
  function copyMessage() {
    navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const money = (n: number) => `${currency}${Math.abs(n).toFixed(2)}`

  // ── Empty state ──

  if (!travelersLoading && travelers.length === 0) {
    return (
      <div className="card text-center py-10 space-y-2">
        <p className="text-forest/50 text-sm">No travelers on the roster yet.</p>
        {mode === 'owner' ? (
          <p className="text-sm text-forest/60">
            Add your group in <Link to="/settings" className="text-sage underline">Settings → Group Split</Link> to start splitting.
          </p>
        ) : (
          <p className="text-sm text-forest/60">Ask the trip planner to add the group roster.</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 1 — Reminder banner (§11): the primary nudge */}
      <SettleBanner tripId={tripId} currency={currency} deadline={deadline} />
      {deadline && (
        <p className="text-xs text-forest/50 -mt-2 px-1">
          Settle-up deadline: {new Date(deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      )}

      {/* 2 — Log an expense */}
      <div className="card">
        <p className="section-label">Log an Expense</p>
        {!formOpen ? (
          <div className="flex gap-2">
            <button onClick={() => openForm()} className="btn-primary flex-1 text-sm">+ Add expense</button>
            <button
              onClick={() => { openForm(); setTimeout(() => fileRef.current?.click(), 0) }}
              className="btn-secondary flex-1 text-sm"
            >
              📷 Scan receipt
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReceiptFile(f); e.target.value = '' }}
            />
            {scanning && (
              <p className="text-sm text-forest/60 text-center py-1"><span className="animate-pulse">🧾</span> Reading your receipt…</p>
            )}
            {scanError && <p className="text-xs text-terracotta">{scanError}</p>}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-forest/50 mb-1">Date</label>
                <input type="date" value={form.spent_on} max={todayStr()}
                  onChange={(e) => setForm({ ...form, spent_on: e.target.value })} className="input text-sm" />
              </div>
              <div>
                <label className="block text-xs text-forest/50 mb-1">Category</label>
                <select value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as SplitCategory })}
                  className="input text-sm">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <input
              type="text" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What was it? e.g. Beach house deposit" className="input"
            />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-forest/50 mb-1">Paid by</label>
                <select value={form.paid_by}
                  onChange={(e) => setForm({ ...form, paid_by: e.target.value })} className="input text-sm">
                  <option value="">Who paid?</option>
                  {allowedPayers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}{t.user_id === null && mode === 'member' ? ' (proxy)' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-forest/50 mb-1">Amount</label>
                <input type="number" min="0" step="0.01" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00" className="input font-mono text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-forest/50 mb-1">Split method</label>
              <div className="flex gap-1.5">
                {METHODS.map((m) => (
                  <button key={m.value}
                    onClick={() => setForm({ ...form, split_method: m.value })}
                    className={`flex-1 text-xs py-1.5 px-1 rounded-lg border transition-colors ${
                      form.split_method === m.value
                        ? 'bg-sage text-white border-sage'
                        : 'bg-white/50 text-forest/60 border-forest/15 hover:bg-cream'
                    }`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-forest/50 mb-1">Shared by</label>
              <div className="flex flex-wrap gap-1.5">
                {travelers.map((t) => {
                  const on = form.shared_with.includes(t.id)
                  return (
                    <button key={t.id}
                      onClick={() =>
                        setForm({
                          ...form,
                          shared_with: on
                            ? form.shared_with.filter((id) => id !== t.id)
                            : [...form.shared_with, t.id],
                        })
                      }
                      className={`text-xs py-1 px-2.5 rounded-full border transition-colors ${
                        on ? 'bg-sage/15 text-sage border-sage/30 font-medium'
                           : 'bg-white/50 text-forest/40 border-forest/15'
                      }`}>
                      {on ? '✓ ' : ''}{t.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {saveMutation.isError && (
              <p className="text-xs text-terracotta">{(saveMutation.error as Error).message}</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !formValid}
                className="btn-primary flex-1">
                {saveMutation.isPending ? 'Saving…' : editingId ? 'Update expense' : 'Save expense'}
              </button>
              {!editingId && (
                <button onClick={() => fileRef.current?.click()} disabled={scanning}
                  className="btn-secondary px-3" title="Scan a receipt to fill this in">📷</button>
              )}
              <button onClick={closeForm} className="btn-secondary px-3">✕</button>
            </div>
          </div>
        )}
      </div>

      {/* 3 — Expense list */}
      {sortedExpenses.length > 0 && (
        <div className="card">
          <div className="flex items-baseline justify-between mb-2">
            <p className="section-label mb-0">Expenses</p>
            <span className="text-xs text-forest/50 font-mono">{money(totalSpend)} total</span>
          </div>
          <div className="space-y-1.5">
            {sortedExpenses.map((e) => {
              const payer = e.paid_by ? travelerById.get(e.paid_by) : null
              const method = METHODS.find((m) => m.value === e.split_method)?.label ?? e.split_method
              return (
                <div key={e.id} className="flex items-center justify-between text-sm py-1 border-b border-forest/5 last:border-0">
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="text-forest truncate">
                      {e.description || e.category || 'Expense'}
                    </p>
                    <p className="text-xs text-forest/40">
                      {[fmtShort(e.spent_on), payer ? `paid by ${payer.name}` : 'no payer', method].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-forest">{money(e.amount)}</span>
                    {mode === 'owner' && (
                      <>
                        <button onClick={() => openForm(e)}
                          className="text-forest/30 hover:text-forest text-xs" title="Edit">✎</button>
                        <button
                          onClick={() => { if (window.confirm('Delete this expense?')) deleteMutation.mutate(e.id) }}
                          className="text-terracotta/50 hover:text-terracotta text-xs leading-none" title="Delete">✕</button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 4 — Balances */}
      {expenses.length > 0 && (
        <div className="card">
          <p className="section-label">Balances</p>
          <div className="space-y-2">
            {balances.map((b) => {
              const status = travelerStatus(b, deadline)
              const canToggle =
                mode === 'owner' || (b.traveler.user_id != null && b.traveler.user_id === currentUserId)
              return (
                <div key={b.traveler.id} className="card-inset px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-forest">{b.traveler.name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status.kind]}`}>
                        {status.label}
                      </span>
                      {canToggle && b.net < -0.005 && (
                        <button
                          onClick={() => toggleSettledMutation.mutate(b.traveler)}
                          disabled={toggleSettledMutation.isPending}
                          className={`text-xs px-2 py-0.5 rounded-md font-medium transition-colors ${
                            b.traveler.settled
                              ? 'bg-forest/10 text-forest/50 hover:bg-terracotta/10 hover:text-terracotta'
                              : 'bg-sage text-white hover:bg-sage/80'
                          }`}>
                          {b.traveler.settled ? 'Undo' : 'Mark settled'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-forest/50">
                    <span>Paid in <span className="font-mono text-forest/70">{money(b.paidIn)}</span></span>
                    <span>Fair share <span className="font-mono text-forest/70">{money(b.fairShare)}</span></span>
                    <span className={`font-mono font-semibold ${
                      b.net > 0.005 ? 'text-sage' : b.net < -0.005 ? 'text-terracotta' : 'text-forest/40'
                    }`}>
                      {b.net > 0.005 ? `gets ${money(b.net)}` : b.net < -0.005 ? `owes ${money(b.net)}` : 'square'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 5 — Settle up: who pays who */}
      {expenses.length > 0 && (
        <div className="card">
          <p className="section-label">Settle Up — Who Pays Who</p>
          {transfers.length === 0 ? (
            <p className="text-sm text-sage py-2">Everyone's squared ✓</p>
          ) : (
            <div className="space-y-2">
              {transfers.map((tr, i) => {
                const link = payLink(tr.to.pay_app, tr.to.pay_handle, tr.amount)
                return (
                  <div key={i} className="flex items-center justify-between card-inset px-3 py-2.5">
                    <div className="text-sm text-forest">
                      <span className="font-medium">{tr.from.name}</span>
                      <span className="text-forest/40"> → </span>
                      <span className="font-medium">{tr.to.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-forest">{money(tr.amount)}</span>
                      {link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer"
                          className="btn-primary text-xs px-3 py-1.5">
                          Pay
                        </a>
                      ) : (
                        <span className="text-xs text-forest/40">(add handle)</span>
                      )}
                    </div>
                  </div>
                )
              })}
              <p className="text-xs text-forest/40">
                Payments happen in your pay app — tap "Mark settled" on a balance once it's done.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 6 — Category totals */}
      {catTotals.length > 0 && (
        <div className="card">
          <p className="section-label">By Category</p>
          <div className="space-y-1">
            {catTotals.map((c) => (
              <div key={c.category} className="flex items-center justify-between text-sm">
                <span className="text-forest/70">{c.category}</span>
                <span className="font-mono text-forest">{money(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7 — Copy-paste group message (secondary; the banner is the nudge) */}
      {expenses.length > 0 && (
        <div className="card">
          <p className="section-label">Group Message</p>
          <pre className="text-xs text-forest/70 bg-cream rounded-lg p-3 whitespace-pre-wrap font-sans mb-2">{message}</pre>
          <button onClick={copyMessage} className="btn-secondary w-full text-sm">
            {copied ? '✓ Copied!' : 'Copy for the group chat'}
          </button>
        </div>
      )}
    </div>
  )
}
