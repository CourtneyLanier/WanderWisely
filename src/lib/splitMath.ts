// Group-split math — a pure-function port of the Trip Treasurer spreadsheet
// (Start Here / Expenses / Dashboard tabs). No I/O, no state: everything here
// is unit-tested in splitMath.test.ts against the spreadsheet's Example numbers.
import type { PayApp, SplitMethod, Traveler, SplitExpense } from '@/types'

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function fmtLongDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

// ── Per-expense shares (Expenses tab, cols O–AE) ───────────────────────────────

// Weight of one traveler for one expense, per the chosen method.
function weightFor(t: Traveler, method: SplitMethod): number {
  if (method === 'party_size') return t.party_size || 1
  if (method === 'custom') return t.custom_weight || 1
  return 1 // 'even'
}

// Returns { travelerId -> dollars owed } for a single expense (unrounded —
// rounding happens once, at the balance level, like the spreadsheet).
export function expenseShares(e: SplitExpense, travelers: Traveler[]): Record<string, number> {
  const sharers = travelers.filter((t) => e.shared_with.includes(t.id))
  const totalW = sharers.reduce((s, t) => s + weightFor(t, e.split_method), 0)
  const out: Record<string, number> = {}
  if (totalW <= 0 || e.amount <= 0) return out
  for (const t of sharers) out[t.id] = (e.amount * weightFor(t, e.split_method)) / totalW
  return out
}

// ── Balances (Dashboard cols C–F) ──────────────────────────────────────────────

export interface Balance {
  traveler: Traveler
  paidIn: number    // sum of amounts they fronted (SUMIF Paid by)
  fairShare: number // sum of their shares across all expenses
  net: number       // paidIn - fairShare  (>0 gets back, <0 owes)
}

export function computeBalances(travelers: Traveler[], expenses: SplitExpense[]): Balance[] {
  const paidIn: Record<string, number> = {}
  const fair: Record<string, number> = {}
  for (const t of travelers) { paidIn[t.id] = 0; fair[t.id] = 0 }
  for (const e of expenses) {
    if (e.paid_by && e.paid_by in paidIn) paidIn[e.paid_by] += e.amount
    const shares = expenseShares(e, travelers)
    for (const [id, amt] of Object.entries(shares)) fair[id] += amt
  }
  return travelers.map((t) => {
    const p = round2(paidIn[t.id])
    const f = round2(fair[t.id])
    return { traveler: t, paidIn: p, fairShare: f, net: round2(p - f) }
  })
}

// ── Settle up — who pays who (Dashboard rows 30–37) ────────────────────────────
// Greedy min-transactions: repeatedly match the biggest creditor with the
// biggest debtor. Travelers marked settled are excluded (spreadsheet C30).

export interface Transfer { from: Traveler; to: Traveler; amount: number }

const EPS = 0.005

export function settleUp(balances: Balance[]): Transfer[] {
  const work = balances
    .filter((b) => !b.traveler.settled)
    .map((b) => ({ t: b.traveler, net: b.net }))
  const transfers: Transfer[] = []
  while (work.length > 0) {
    let cr = work[0], db = work[0]
    for (const w of work) {
      if (w.net > cr.net) cr = w
      if (w.net < db.net) db = w
    }
    // Everyone squared — or no matching debtor left (possible when settled
    // travelers are excluded, leaving the books intentionally unbalanced).
    if (cr.net <= EPS || db.net >= -EPS) break
    const amount = round2(Math.min(cr.net, -db.net))
    transfers.push({ from: db.t, to: cr.t, amount })
    cr.net = round2(cr.net - amount)
    db.net = round2(db.net + amount)
  }
  return transfers
}

// ── Pay deep links (Dashboard AI19) ────────────────────────────────────────────

export function payLink(app: PayApp | null, handle: string | null, amount: number): string | null {
  if (!app || !handle) return null
  const h = handle.replace(/[@$]/g, '')
  if (!h) return null
  const amt = amount.toFixed(2)
  switch (app) {
    case 'venmo': return `https://venmo.com/u/${h}?txn=pay&amount=${amt}&note=Trip`
    case 'paypal': return `https://paypal.me/${h}/${amt}`
    case 'cashapp': return `https://cash.app/$${h}/${amt}`
    default: return null // 'other' → no deep link, show "(add handle)"
  }
}

// ── Deadline status (Dashboard H7) ─────────────────────────────────────────────

export type StatusKind = 'settled' | 'paid' | 'owes' | 'overdue' | 'due_today' | 'due_soon'

export function travelerStatus(
  b: Balance,
  deadlineISO: string | null
): { kind: StatusKind; label: string } {
  if (b.net >= -EPS) return { kind: 'settled', label: '—' }
  if (b.traveler.settled) return { kind: 'paid', label: 'paid ✓' }
  if (!deadlineISO) return { kind: 'owes', label: 'owes' }
  const today = startOfDay(new Date())
  const due = startOfDay(new Date(deadlineISO + 'T00:00:00'))
  const days = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (days < 0) return { kind: 'overdue', label: 'OVERDUE' }
  if (days === 0) return { kind: 'due_today', label: 'due today' }
  return { kind: 'due_soon', label: `due in ${days}d` }
}

// ── Group message (Dashboard B39 TEXTJOIN) ─────────────────────────────────────

export function groupMessage(
  tripName: string,
  currency: string,
  deadlineISO: string | null,
  balances: Balance[]
): string {
  const lines = [`📊 ${tripName} — trip tally`]
  if (deadlineISO) lines.push(`Settle up by ${fmtLongDate(deadlineISO)}`)
  lines.push('')
  const overdue = deadlineISO
    ? startOfDay(new Date()) > startOfDay(new Date(deadlineISO + 'T00:00:00'))
    : false
  for (const b of balances) {
    if (b.net >= -EPS) lines.push(`• ${b.traveler.name}: all square ✓`)
    else if (b.traveler.settled) lines.push(`• ${b.traveler.name}: paid ✓`)
    else lines.push(`• ${b.traveler.name}: owes ${currency}${Math.abs(b.net).toFixed(2)}${overdue ? ' (OVERDUE)' : ''}`)
  }
  return lines.join('\n')
}

// ── Category totals (Dashboard J/K) ────────────────────────────────────────────

export function categoryTotals(expenses: SplitExpense[]): { category: string; total: number }[] {
  const map = new Map<string, number>()
  for (const e of expenses) {
    const key = e.category ?? 'Other'
    map.set(key, (map.get(key) ?? 0) + e.amount)
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, total: round2(total) }))
    .sort((a, b) => b.total - a.total)
}
