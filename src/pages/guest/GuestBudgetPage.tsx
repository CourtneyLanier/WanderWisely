import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Guest read-only Budget tab. Only rendered when the owner has explicitly
// turned on Budget sharing for this trip — the one place money is guest-visible.
// Summary numbers only; no spending line items.

interface GBudget {
  food_total: number
  food_days: number
  hotel_buffer: number
  car_total_budget: number
}

interface GSpending {
  card: string
  spent: number
}

function dollar(n: number) {
  const abs = Math.abs(n)
  return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function BudgetCard({
  icon,
  label,
  budget,
  spent,
}: {
  icon: string
  label: string
  budget: number | null // null = no budget set, show spent only
  spent: number
}) {
  const remaining = budget != null ? budget - spent : null
  const pct = budget != null && budget > 0 ? Math.min(100, (spent / budget) * 100) : 0
  const over = budget != null && spent > budget

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <p className="section-label mb-0">{icon} {label}</p>
        <p className="font-mono text-sm text-forest">
          {dollar(Math.round(spent))}{budget != null ? ` / ${dollar(budget)}` : ' total'}
        </p>
      </div>
      {budget != null && budget > 0 && (
        <>
          <div className="h-2 bg-cream rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all ${over ? 'bg-terracotta' : 'bg-sage'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className={`text-xs font-mono ${over ? 'text-terracotta' : 'text-forest/50'}`}>
            {over
              ? `${dollar(Math.round(spent - budget))} over budget`
              : `${dollar(Math.round(remaining!))} remaining`}
          </p>
        </>
      )}
    </div>
  )
}

export default function GuestBudgetPage() {
  const { shareCode } = useParams<{ shareCode: string }>()

  const { data: budgetArr = [], isLoading: budgetLoading } = useQuery({
    queryKey: ['guest_budget', shareCode],
    queryFn: async (): Promise<GBudget[]> => {
      const { data, error } = await supabase.rpc('guest_get_budget', { p_share_code: shareCode! })
      if (error) throw error
      return (data ?? []) as GBudget[]
    },
    enabled: !!shareCode,
  })

  const { data: spending = [], isLoading: spendingLoading } = useQuery({
    queryKey: ['guest_spending', shareCode],
    queryFn: async (): Promise<GSpending[]> => {
      const { data, error } = await supabase.rpc('guest_get_spending_summary', { p_share_code: shareCode! })
      if (error) throw error
      return (data ?? []) as GSpending[]
    },
    enabled: !!shareCode,
  })

  const budget = budgetArr[0]
  const spentBy = (card: string) => spending.find((s) => s.card === card)?.spent ?? 0

  if (budgetLoading || spendingLoading) {
    return (
      <div className="p-4 pt-6 flex justify-center py-20">
        <p className="text-forest/40 text-sm">Loading…</p>
      </div>
    )
  }

  if (!budget) {
    return (
      <div className="p-4 pt-6 pb-10">
        <h1 className="font-display text-2xl text-forest mb-4">Budget</h1>
        <div className="card text-center py-14 space-y-2">
          <p className="text-3xl">💰</p>
          <p className="text-forest/50 text-sm">Budget isn't shared for this trip.</p>
        </div>
      </div>
    )
  }

  const miscSpent = spentBy('misc')

  return (
    <div className="p-4 pt-6 pb-10">
      <h1 className="font-display text-2xl text-forest mb-4">Budget</h1>
      <div className="space-y-3">
        <BudgetCard icon="🍽️" label="Food" budget={budget.food_total} spent={spentBy('food')} />
        <BudgetCard icon="🏨" label="Hotel" budget={budget.hotel_buffer} spent={spentBy('hotel')} />
        <BudgetCard icon="🚗" label="Car" budget={budget.car_total_budget} spent={spentBy('car')} />
        {miscSpent > 0 && <BudgetCard icon="📋" label="Misc" budget={null} spent={miscSpent} />}
      </div>
      <p className="text-xs text-forest/40 mt-4 text-center">
        Shared by the trip owner · totals update as spending is logged
      </p>
    </div>
  )
}
