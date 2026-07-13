// Golden tests for splitMath — verified against the Trip Treasurer
// spreadsheet's Example tab (blueprint §15).
//
// The spreadsheet itself isn't in the repo, so the expense rows below were
// derived to reproduce the Example tab EXACTLY: with all four travelers
// sharing every expense, the §15 table is uniquely determined by the totals
// per split method — even = 280, party_size = 2963, custom = 559 (sum 3802).
// Every expected value below (paid in, fair share, balance, transfer order,
// total spend) is copied verbatim from §15, not computed by the code under test.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  expenseShares,
  computeBalances,
  settleUp,
  payLink,
  travelerStatus,
  groupMessage,
  categoryTotals,
  type Balance,
} from './splitMath'
import type { Traveler, SplitExpense } from '@/types'

// ── Fixtures ───────────────────────────────────────────────────────────────────

function traveler(partial: Partial<Traveler> & { id: string; name: string }): Traveler {
  return {
    trip_id: 'trip-1',
    party_size: 1,
    pay_app: null,
    pay_handle: null,
    custom_weight: 1,
    settled: false,
    email: null,
    user_id: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

function expense(partial: Partial<SplitExpense> & { id: string; amount: number }): SplitExpense {
  return {
    trip_id: 'trip-1',
    spent_on: null,
    description: null,
    category: null,
    paid_by: null,
    split_method: 'even',
    shared_with: [],
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

// §15 travelers: Smith (party 5, wt 2), Jones (2, 2), Lee (3, 2), Grandma Pat (1, 1)
const smith = traveler({ id: 'smith', name: 'Smith', party_size: 5, custom_weight: 2 })
const jones = traveler({ id: 'jones', name: 'Jones', party_size: 2, custom_weight: 2 })
const lee = traveler({ id: 'lee', name: 'Lee', party_size: 3, custom_weight: 2 })
const pat = traveler({ id: 'pat', name: 'Grandma Pat', party_size: 1, custom_weight: 1 })
const TRAVELERS = [smith, jones, lee, pat]
const ALL = ['smith', 'jones', 'lee', 'pat']

const EXPENSES: SplitExpense[] = [
  expense({ id: 'e1', description: 'Beach house', category: 'Lodging', paid_by: 'smith', amount: 2530, split_method: 'party_size', shared_with: ALL }),
  expense({ id: 'e2', description: 'Gas', category: 'Gas', paid_by: 'jones', amount: 433, split_method: 'party_size', shared_with: ALL }),
  expense({ id: 'e3', description: 'Groceries', category: 'Food', paid_by: 'jones', amount: 287, split_method: 'custom', shared_with: ALL }),
  expense({ id: 'e4', description: 'Boat tour', category: 'Activities', paid_by: 'lee', amount: 272, split_method: 'custom', shared_with: ALL }),
  expense({ id: 'e5', description: 'Dinner out', category: 'Food', paid_by: 'lee', amount: 280, split_method: 'even', shared_with: ALL }),
]

function balanceFor(balances: Balance[], id: string): Balance {
  const b = balances.find((x) => x.traveler.id === id)
  if (!b) throw new Error(`no balance for ${id}`)
  return b
}

// ── §15 golden numbers ─────────────────────────────────────────────────────────

describe('computeBalances — §15 Example tab', () => {
  const balances = computeBalances(TRAVELERS, EXPENSES)

  it('total spend is 3802', () => {
    expect(EXPENSES.reduce((s, e) => s + e.amount, 0)).toBe(3802)
  })

  it.each([
    ['smith', 2530, 1576.53, 953.47],
    ['jones', 720, 768.44, -48.44],
    ['lee', 552, 1037.81, -485.81],
    ['pat', 0, 419.22, -419.22],
  ])('%s: paid in / fair share / balance', (id, paidIn, fairShare, net) => {
    const b = balanceFor(balances, id)
    expect(b.paidIn).toBe(paidIn)
    expect(b.fairShare).toBe(fairShare)
    expect(b.net).toBe(net)
  })

  it('balances sum to ~0', () => {
    const sum = balances.reduce((s, b) => s + b.net, 0)
    expect(Math.abs(sum)).toBeLessThan(0.005)
  })
})

describe('settleUp — §15 who pays who', () => {
  it('produces the exact expected transfers, in order', () => {
    const transfers = settleUp(computeBalances(TRAVELERS, EXPENSES))
    expect(
      transfers.map((t) => [t.from.id, t.to.id, t.amount])
    ).toEqual([
      ['lee', 'smith', 485.81],
      ['pat', 'smith', 419.22],
      ['jones', 'smith', 48.44],
    ])
  })

  it('excludes travelers marked settled', () => {
    const settledPat = { ...pat, settled: true }
    const balances = computeBalances([smith, jones, lee, settledPat], EXPENSES)
    const transfers = settleUp(balances)
    expect(transfers.some((t) => t.from.id === 'pat' || t.to.id === 'pat')).toBe(false)
    // Lee and Jones still pay their full amounts.
    expect(transfers.map((t) => [t.from.id, t.amount])).toEqual([
      ['lee', 485.81],
      ['jones', 48.44],
    ])
  })

  it('returns nothing when everyone is squared', () => {
    expect(settleUp(computeBalances(TRAVELERS, []))).toEqual([])
  })

  it('handles an empty roster without crashing', () => {
    expect(settleUp([])).toEqual([])
  })
})

// ── expenseShares edge cases ───────────────────────────────────────────────────

describe('expenseShares', () => {
  it('splits evenly', () => {
    const shares = expenseShares(
      expense({ id: 'x', amount: 100, split_method: 'even', shared_with: ALL }),
      TRAVELERS
    )
    expect(shares.smith).toBe(25)
    expect(shares.pat).toBe(25)
  })

  it('splits by party size (5/2/3/1 of 11)', () => {
    const shares = expenseShares(
      expense({ id: 'x', amount: 110, split_method: 'party_size', shared_with: ALL }),
      TRAVELERS
    )
    expect(shares.smith).toBeCloseTo(50, 10)
    expect(shares.jones).toBeCloseTo(20, 10)
    expect(shares.lee).toBeCloseTo(30, 10)
    expect(shares.pat).toBeCloseTo(10, 10)
  })

  it('splits by custom weight (2/2/2/1 of 7)', () => {
    const shares = expenseShares(
      expense({ id: 'x', amount: 70, split_method: 'custom', shared_with: ALL }),
      TRAVELERS
    )
    expect(shares.smith).toBeCloseTo(20, 10)
    expect(shares.pat).toBeCloseTo(10, 10)
  })

  it('only distributes among shared_with', () => {
    const shares = expenseShares(
      expense({ id: 'x', amount: 100, split_method: 'even', shared_with: ['smith', 'lee'] }),
      TRAVELERS
    )
    expect(shares.smith).toBe(50)
    expect(shares.lee).toBe(50)
    expect(shares.jones).toBeUndefined()
    expect(shares.pat).toBeUndefined()
  })

  it('returns empty for zero amount or no sharers', () => {
    expect(expenseShares(expense({ id: 'x', amount: 0, shared_with: ALL }), TRAVELERS)).toEqual({})
    expect(expenseShares(expense({ id: 'x', amount: 100, shared_with: [] }), TRAVELERS)).toEqual({})
  })

  it('treats party_size 0 as 1 (never divides by zero)', () => {
    const zeroParty = traveler({ id: 'z', name: 'Z', party_size: 0 })
    const shares = expenseShares(
      expense({ id: 'x', amount: 100, split_method: 'party_size', shared_with: ['z'] }),
      [zeroParty]
    )
    expect(shares.z).toBe(100)
  })
})

// ── payLink (Dashboard AI19) ───────────────────────────────────────────────────

describe('payLink', () => {
  it('builds venmo / paypal / cashapp links with the amount', () => {
    expect(payLink('venmo', 'kevin-smith', 485.81)).toBe(
      'https://venmo.com/u/kevin-smith?txn=pay&amount=485.81&note=Trip'
    )
    expect(payLink('paypal', 'kevinsmith', 48.4)).toBe('https://paypal.me/kevinsmith/48.40')
    expect(payLink('cashapp', 'kevin', 419.22)).toBe('https://cash.app/$kevin/419.22')
  })

  it('strips @ and $ from handles (spreadsheet AH19)', () => {
    expect(payLink('venmo', '@kevin', 10)).toBe('https://venmo.com/u/kevin?txn=pay&amount=10.00&note=Trip')
    expect(payLink('cashapp', '$kevin', 10)).toBe('https://cash.app/$kevin/10.00')
  })

  it('returns null for other / missing app or handle', () => {
    expect(payLink('other', 'kevin', 10)).toBeNull()
    expect(payLink(null, 'kevin', 10)).toBeNull()
    expect(payLink('venmo', null, 10)).toBeNull()
    expect(payLink('venmo', '@', 10)).toBeNull()
  })
})

// ── travelerStatus (Dashboard H7) ──────────────────────────────────────────────

describe('travelerStatus around the deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-13T10:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  const owing = (t: Traveler): Balance => ({ traveler: t, paidIn: 0, fairShare: 100, net: -100 })

  it('flips OVERDUE / due today / due in Nd around the deadline', () => {
    expect(travelerStatus(owing(pat), '2026-07-12').kind).toBe('overdue')
    expect(travelerStatus(owing(pat), '2026-07-13').kind).toBe('due_today')
    expect(travelerStatus(owing(pat), '2026-07-16')).toEqual({ kind: 'due_soon', label: 'due in 3d' })
  })

  it('no deadline → plain owes', () => {
    expect(travelerStatus(owing(pat), null).kind).toBe('owes')
  })

  it('net >= 0 → settled dash, regardless of deadline', () => {
    const square: Balance = { traveler: pat, paidIn: 100, fairShare: 100, net: 0 }
    expect(travelerStatus(square, '2026-07-01').kind).toBe('settled')
  })

  it('marked settled while owing → paid ✓', () => {
    const paid = owing({ ...pat, settled: true })
    expect(travelerStatus(paid, '2026-07-01')).toEqual({ kind: 'paid', label: 'paid ✓' })
  })
})

// ── groupMessage (Dashboard B39) ───────────────────────────────────────────────

describe('groupMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-13T10:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('matches the balances, worst-first content intact', () => {
    const balances = computeBalances(TRAVELERS, EXPENSES)
    const msg = groupMessage('Beach Week', '$', '2026-07-20', balances)
    expect(msg).toBe(
      [
        '📊 Beach Week — trip tally',
        'Settle up by July 20, 2026',
        '',
        '• Smith: all square ✓',
        '• Jones: owes $48.44',
        '• Lee: owes $485.81',
        '• Grandma Pat: owes $419.22',
      ].join('\n')
    )
  })

  it('flags OVERDUE past the deadline', () => {
    const balances = computeBalances(TRAVELERS, EXPENSES)
    const msg = groupMessage('Beach Week', '$', '2026-07-01', balances)
    expect(msg).toContain('• Lee: owes $485.81 (OVERDUE)')
  })
})

// ── categoryTotals (Dashboard J/K) ─────────────────────────────────────────────

describe('categoryTotals', () => {
  it('groups and sums by category, largest first', () => {
    expect(categoryTotals(EXPENSES)).toEqual([
      { category: 'Lodging', total: 2530 },
      { category: 'Food', total: 567 },
      { category: 'Gas', total: 433 },
      { category: 'Activities', total: 272 },
    ])
  })
})
