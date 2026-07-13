import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { computeBalances, travelerStatus } from '@/lib/splitMath'
import type { Traveler, SplitExpense } from '@/types'

// Live reminder banner (blueprint §11) — the primary nudge that replaces the
// spreadsheet's manual copy-paste message. Pure client-side: recomputed from
// balances everywhere the trip is open, so nobody is responsible for nagging.
// Self-fetching (shared query keys), works for owner AND members via RLS.

export default function SettleBanner({
  tripId,
  currency,
  deadline,
  linkTo,
}: {
  tripId: string
  currency: string
  deadline: string | null
  linkTo?: string // optional route to open when tapped (e.g. '/split')
}) {
  const { data: travelers = [] } = useQuery({
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

  if (travelers.length === 0 || expenses.length === 0) return null

  const balances = computeBalances(travelers, expenses)
  const owing = balances
    .map((b) => ({ b, status: travelerStatus(b, deadline) }))
    .filter(({ status }) => ['owes', 'overdue', 'due_today', 'due_soon'].includes(status.kind))
    .sort((x, y) => x.b.net - y.b.net) // worst first

  let body: React.ReactNode
  let tone: string

  if (owing.length === 0) {
    tone = 'bg-sage/15 text-sage border-sage/20'
    body = <span className="font-medium">Everyone's settled ✓</span>
  } else {
    const anyOverdue = owing.some(({ status }) => status.kind === 'overdue')
    tone = anyOverdue
      ? 'bg-terracotta/15 text-terracotta border-terracotta/20'
      : 'bg-gold/15 text-gold border-gold/25'
    body = (
      <span>
        {owing.map(({ b, status }, i) => (
          <span key={b.traveler.id}>
            {i > 0 && <span className="opacity-50"> · </span>}
            <span className="font-medium">{b.traveler.name}</span>
            {' owes '}
            <span className="font-mono font-semibold">
              {currency}{Math.abs(b.net).toFixed(2)}
            </span>
            {status.kind === 'overdue' && <span className="font-semibold"> (OVERDUE)</span>}
            {status.kind === 'due_today' && ' (due today)'}
            {status.kind === 'due_soon' && ` (${status.label})`}
          </span>
        ))}
      </span>
    )
  }

  const content = (
    <div className={`rounded-lg border px-3 py-2.5 text-sm leading-relaxed ${tone}`}>
      {body}
      {linkTo && <span className="opacity-50 text-xs"> ↗</span>}
    </div>
  )

  return linkTo ? <Link to={linkTo} className="block">{content}</Link> : content
}
