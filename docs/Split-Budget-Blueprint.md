# WanderWisely — Split Budget ("Trip Treasurer") Blueprint

A hand-off spec for Claude Code. Goal: add a group-splitting budget mode to WanderWisely that ports the **Trip Treasurer** spreadsheet's logic into the app, living alongside (not replacing) the existing solo envelope budget.

---

## 1. Decisions already locked

1. **Two independent tabs.** Keep the current **Budget** tab (envelope drawdown, one payer) exactly as-is. Add a new **Split** tab (the group ledger). Both appear when split is enabled. **They do not talk to each other in v1** — no auto-syncing a person's share into their personal envelope. That bridge is a future enhancement (see §14); building it now risks double-counting bugs.
2. **One premium gate — "free to join, pay to plan."** The whole app is the paid upgrade over the Etsy spreadsheet, behind a single unlock (**not** a nested second paywall). But **only the person who owns/plans a trip pays. Members who are just going on the trip never pay — permanently, including after beta.** A free login is enough to join someone else's trip; payment is required only to own/plan your own. (Deliberate growth loop: people join free, then pay when they want to plan their own trip.)
3. **Full parity with the spreadsheet.** Travelers, all three split methods, per-expense "shared by", settle-up "who pays who", pay-app deep links, deadline + status, and the copy-paste group message.
4. **Real membership, not anonymous guests.** Everyone on the trip already logs in (the app is invite-only in beta), so split uses their **actual accounts**. When a logged-in user opens the owner's share link they're enrolled as a **member** of the trip and claim their spot on the owner-built roster; from then on their identity is their login, not a tap-your-name guess. Members can add expenses, pay, and mark their own row settled; the owner keeps edit/delete and can log on behalf of roster people who never log in ("proxy travelers"). Setup (roster, deadline, currency) stays owner-only. See §10.
5. **Reminders are a live in-app banner (v1).** No copy-paste, nobody responsible for nagging — a banner shows who still owes / who's overdue everywhere the trip is open. Push and email are deferred fast-follows. See §11.

---

## 2. Why this is a new data model, not a tweak

The current budget is **envelopes that draw down for one payer** (`budget` + `spending_log`, four cards). Splitting has no envelope — it's **travelers + per-expense who-paid/who-shares + end reconciliation**. So the Split tab gets its own tables and its own page. The existing solo budget code is untouched.

The good news: the spreadsheet's math ports cleanly. Everything below traces to a specific part of `WanderWisely Trip Treasurer.xlsx` (Start Here / Expenses / Dashboard tabs).

---

## 3. Architecture at a glance

```
OWNER — Settings (Setup tab)
  └─ "Group Split" card ─> enable toggle (premium-gated)
                          roster: travelers (up to 8), each w/ optional email
                          currency + settle-up deadline + share_split toggle

Nav: Budget tab (unchanged)  +  Split tab (shown when split_enabled && premium)

Split view (owner tab AND member view — the live dashboard):
  ├─ Reminder banner  (who owes / overdue — primary nudge)
  ├─ Log expense (date, desc, category, paid-by, amount, split method, shared-by)
  ├─ Expense list      (owner: edit/delete · member: add own)
  ├─ Balances table    (paid in / fair share / balance / owes-or-gets / status)
  ├─ Settle up — who pays who  (+ Pay buttons)
  ├─ Category totals
  └─ Copy-paste group message  (secondary)

MEMBER (son, girlfriend, …) — opens owner's share link while logged in
  └─ auto-enrolled in trip_members → claims a roster spot (by email or picker)
     → acts as themselves: add expenses, pay, mark own row settled
  Proxy travelers (e.g. Grandma Pat, never logs in) → owner/members log for them
```

Setup (roster/currency/deadline) lives in **Settings** — mirrors "Start Here". The live logging + dashboard is the **Split view** — mirrors "Expenses" + "Dashboard". Members reach it by opening the share link while logged in (§10).

---

## 4. Data model — new migration `011_split_budget.sql`

Follow the existing migration style in `supabase/migrations/`. Add owner RLS policies mirroring the `owner_all_*` pattern in `001_initial_schema.sql`, **plus member policies** (see §10): a user with a `trip_members` row for a trip may read the roster/expenses, insert expenses paid by their own linked traveler, and update their own traveler's `settled`.

```sql
-- Trip-level split settings (columns on trips, like the share_* flags)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS split_enabled  boolean NOT NULL DEFAULT false;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS split_currency text    NOT NULL DEFAULT '$';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS split_deadline date;              -- settle-up deadline, nullable
ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_split    boolean NOT NULL DEFAULT false; -- guest visibility (see §10)

-- Travelers (up to 8 per trip)
CREATE TABLE IF NOT EXISTS travelers (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id       uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name          text NOT NULL,
  party_size    int  NOT NULL DEFAULT 1,        -- powers "By party size"
  pay_app       text CHECK (pay_app IN ('venmo','paypal','cashapp','other') OR pay_app IS NULL),
  pay_handle    text,                            -- store WITHOUT leading @ or $
  custom_weight numeric(10,2) NOT NULL DEFAULT 1,-- powers "Custom %"
  settled       boolean NOT NULL DEFAULT false,  -- the Dashboard "Paid?" column
  email         text,                            -- optional; lets a member auto-claim this roster spot
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- set when a member claims this traveler; NULL = proxy traveler (never logs in)
  sort_order    int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Trip membership: links an authenticated NON-owner user to a trip they participate in.
-- (The owner is still just trips.owner_uid — they don't need a row here.)
CREATE TABLE IF NOT EXISTS trip_members (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id   uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member' CHECK (role IN ('member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id)
);

-- Split expenses (one cost per row)
CREATE TABLE IF NOT EXISTS split_expenses (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id      uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  spent_on     date,
  description  text,
  category     text,                              -- Lodging/Food/Transportation/Gas/Activities/Shopping/Other
  paid_by      uuid REFERENCES travelers(id) ON DELETE SET NULL,
  amount       numeric(10,2) NOT NULL DEFAULT 0,
  split_method text NOT NULL DEFAULT 'even'
                 CHECK (split_method IN ('even','party_size','custom')),
  shared_with  uuid[] NOT NULL DEFAULT '{}',      -- traveler ids sharing this cost
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_travelers_trip       ON travelers(trip_id);
CREATE INDEX IF NOT EXISTS idx_split_expenses_trip  ON split_expenses(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_trip    ON trip_members(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_user    ON trip_members(user_id);
```

**Member RLS sketch** (add alongside the `owner_all_*` policies). A helper predicate `EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id = <row>.trip_id AND m.user_id = auth.uid())` gates member access:
- `travelers`, `split_expenses`, `trips` (limited columns): members may `SELECT`.
- `split_expenses`: members may `INSERT` where `paid_by` is a traveler whose `user_id = auth.uid()` (or a proxy traveler on the same trip).
- `travelers`: members may `UPDATE settled` only on the row where `user_id = auth.uid()`.
- Everything else stays owner-only.

Design notes:
- `shared_with` as a `uuid[]` avoids a join table — fine for ≤8 travelers and matches the spreadsheet's per-row checkbox columns (G:N).
- `pay_handle` stored bare; strip `@`/`$` on input (spreadsheet does this in `AH19`).
- `settled` per traveler = the Dashboard **Paid?** column; when true, they're excluded from settle-up and shown as "paid ✓".

---

## 5. TypeScript types (`src/types/index.ts`)

```ts
export type PayApp = 'venmo' | 'paypal' | 'cashapp' | 'other'
export type SplitMethod = 'even' | 'party_size' | 'custom'
export type SplitCategory =
  | 'Lodging' | 'Food' | 'Transportation' | 'Gas' | 'Activities' | 'Shopping' | 'Other'

export interface Traveler {
  id: string
  trip_id: string
  name: string
  party_size: number
  pay_app: PayApp | null
  pay_handle: string | null
  custom_weight: number
  settled: boolean
  email: string | null          // optional; used to auto-claim a roster spot
  user_id: string | null        // set when a member claims this traveler; null = proxy
  sort_order: number
}

export interface SplitExpense {
  id: string
  trip_id: string
  spent_on: string | null
  description: string | null
  category: SplitCategory | null
  paid_by: string | null        // traveler id
  amount: number
  split_method: SplitMethod
  shared_with: string[]         // traveler ids
}

export interface TripMember {
  id: string
  trip_id: string
  user_id: string
  role: 'member'
  joined_at: string
}
```

Add `split_enabled`, `split_currency`, `split_deadline`, `share_split` to the `Trip` interface.

---

## 6. Core logic — new module `src/lib/splitMath.ts`

This is the heart of the port. All of it is pure functions (easy to unit-test).

### 6a. Per-expense shares (Expenses tab, cols O–AE)

```ts
// Weight of one traveler for one expense, per the chosen method.
function weightFor(t: Traveler, method: SplitMethod): number {
  if (method === 'party_size') return t.party_size || 1
  if (method === 'custom')     return t.custom_weight || 1
  return 1 // 'even'
}

// Returns { travelerId -> dollars owed } for a single expense.
export function expenseShares(e: SplitExpense, travelers: Traveler[]): Record<string, number> {
  const sharers = travelers.filter(t => e.shared_with.includes(t.id))
  const totalW = sharers.reduce((s, t) => s + weightFor(t, e.split_method), 0)
  const out: Record<string, number> = {}
  if (totalW <= 0 || e.amount <= 0) return out
  for (const t of sharers) out[t.id] = e.amount * weightFor(t, e.split_method) / totalW
  return out
}
```

### 6b. Balances (Dashboard cols C–F)

```ts
export interface Balance {
  traveler: Traveler
  paidIn: number     // sum of amounts they fronted (SUMIF Paid by)
  fairShare: number  // sum of their shares across all expenses
  net: number        // paidIn - fairShare  (>0 gets back, <0 owes)
}

export function computeBalances(travelers: Traveler[], expenses: SplitExpense[]): Balance[] {
  const paidIn: Record<string, number> = {}
  const fair:   Record<string, number> = {}
  for (const t of travelers) { paidIn[t.id] = 0; fair[t.id] = 0 }
  for (const e of expenses) {
    if (e.paid_by) paidIn[e.paid_by] = (paidIn[e.paid_by] ?? 0) + e.amount
    const shares = expenseShares(e, travelers)
    for (const [id, amt] of Object.entries(shares)) fair[id] = (fair[id] ?? 0) + amt
  }
  return travelers.map(t => {
    const p = round2(paidIn[t.id]), f = round2(fair[t.id])
    return { traveler: t, paidIn: p, fairShare: f, net: round2(p - f) }
  })
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
```

### 6c. Settle-up "who pays who" (Dashboard rows 30–37)

Greedy min-transactions: repeatedly match the biggest creditor with the biggest debtor. Travelers marked `settled` are excluded (spreadsheet zeroes them in `C30`).

```ts
export interface Transfer { from: Traveler; to: Traveler; amount: number }

export function settleUp(balances: Balance[]): Transfer[] {
  const work = balances
    .filter(b => !b.traveler.settled)
    .map(b => ({ t: b.traveler, net: b.net }))
  const transfers: Transfer[] = []
  const EPS = 0.005
  while (true) {
    let cr = work[0], db = work[0]
    for (const w of work) { if (w.net > cr.net) cr = w; if (w.net < db.net) db = w }
    if (cr.net <= EPS) break                    // everyone squared
    const amount = round2(Math.min(cr.net, -db.net))
    transfers.push({ from: db.t, to: cr.t, amount })
    cr.net = round2(cr.net - amount)
    db.net = round2(db.net + amount)
  }
  return transfers
}
```

### 6d. Pay deep links (Dashboard `AI19`)

```ts
export function payLink(app: PayApp | null, handle: string | null, amount: number): string | null {
  if (!app || !handle) return null
  const h = handle.replace(/[@$]/g, '')
  const amt = amount.toFixed(2)
  switch (app) {
    case 'venmo':   return `https://venmo.com/u/${h}?txn=pay&amount=${amt}&note=Trip`
    case 'paypal':  return `https://paypal.me/${h}/${amt}`
    case 'cashapp': return `https://cash.app/$${h}/${amt}`
    default:        return null   // 'other' → no deep link, show "(add handle)"
  }
}
```

### 6e. Deadline status (Dashboard `H7`)

```ts
export type StatusKind = 'settled' | 'paid' | 'owes' | 'overdue' | 'due_today' | 'due_soon'
export function travelerStatus(b: Balance, deadlineISO: string | null): { kind: StatusKind; label: string } {
  if (b.net >= -0.005) return { kind: 'settled', label: '—' }
  if (b.traveler.settled) return { kind: 'paid', label: 'paid ✓' }
  if (!deadlineISO) return { kind: 'owes', label: 'owes' }
  const today = startOfDay(new Date())
  const due = startOfDay(new Date(deadlineISO + 'T00:00:00'))
  const days = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (days < 0)  return { kind: 'overdue',   label: 'OVERDUE' }
  if (days === 0) return { kind: 'due_today', label: 'due today' }
  return { kind: 'due_soon', label: `due in ${days}d` }
}
```

### 6f. Group message (Dashboard `B39` TEXTJOIN)

```ts
export function groupMessage(
  tripName: string, currency: string, deadlineISO: string | null,
  balances: Balance[]
): string {
  const lines = [`📊 ${tripName} — trip tally`]
  if (deadlineISO) lines.push(`Settle up by ${fmtLongDate(deadlineISO)}`)
  lines.push('')
  const overdue = deadlineISO ? startOfDay(new Date()) > startOfDay(new Date(deadlineISO + 'T00:00:00')) : false
  for (const b of balances) {
    if (b.net >= -0.005)          lines.push(`• ${b.traveler.name}: all square ✓`)
    else if (b.traveler.settled)  lines.push(`• ${b.traveler.name}: paid ✓`)
    else lines.push(`• ${b.traveler.name}: owes ${currency}${Math.abs(b.net).toFixed(2)}${overdue ? ' (OVERDUE)' : ''}`)
  }
  return lines.join('\n')
}
```

Category totals (Dashboard J/K) are a trivial `groupBy(category) → sum(amount)`.

---

## 7. Settings additions (`src/pages/owner/SettingsPage.tsx`)

Add a **"Group Split"** card (place it near the Budget card). It contains:

1. **Enable toggle** (`trips.split_enabled`), styled like the existing `share_enabled` switch. **Premium-gated** (see §12): if not unlocked, show the toggle disabled with an "Unlock in [app] premium" affordance instead of flipping it.
2. **Currency** input (`trips.split_currency`, default `$`).
3. **Settle-up deadline** date input (`trips.split_deadline`, nullable).
4. **Travelers manager** — up to 8 rows, each: name, # in party, pay app (select: Venmo/PayPal/Cash App/Other), pay handle, custom weight. Add / remove / reorder. CRUD against the `travelers` table. Mirror the input hints from the spreadsheet's Start Here tab ("drop the @ or $ — just the username").

Save pattern: reuse the page's existing mutation/`invalidateQueries` approach. Traveler edits can save immediately (like the per-tab share switches) or via the page's Save button — match whatever is simplest and consistent.

---

## 8. New Split tab page (`src/pages/owner/SplitPage.tsx`)

Model it on `BudgetPage.tsx` structure and styling (cards, `font-display`, `text-forest`, progress-bar/pill patterns, the receipt-scan flow). Queries: `travelers`, `split_expenses`, and the `trip` (for currency/deadline/name). Sections top-to-bottom:

1. **Header + reminder banner** — trip name, deadline, and an auto **status banner** (see §11): e.g. "Linda owes $419 — OVERDUE" or "Everyone's settled ✓". Always live — this is the primary nudge and replaces the manual copy-paste.
2. **Log an expense** — form: date, description, category (select), paid-by (traveler select), amount, split method (Even / By party size / Custom %), and shared-by (checkbox chips for each traveler, default all checked). Insert into `split_expenses`. **Reuse `ReceiptScanFlow`** from BudgetPage so scanned receipts can create split expenses — nice parity win over the spreadsheet.
3. **Expense list** — recent first, edit/delete, show payer + split method + amount.
4. **Balances** — table: Traveler | Paid in | Fair share | Balance | owes/gets | status pill. From `computeBalances` + `travelerStatus`. Color: gets-back = sage, owes = terracotta, settled = muted (match existing palette).
5. **Settle up — who pays who** — from `settleUp`. Each row: `{from} → {to}  {amount}` with a **Pay** button (`payLink`, opens the payer's Venmo/PayPal/Cash App in a new tab). If no handle, show "(add handle)". Pay works for owner *and* guests (it's just a deep link — no account needed). **Mark settled:** the owner can mark anyone; a guest can mark only their own row (see §10 for the guest identity model). Toggles `travelers.settled`. Note: the app cannot detect that a payment actually happened, so "settled" is always a manual tap.
6. **Category totals** — small list.
7. **Copy-paste group message** *(secondary)* — read-only box + "Copy" button (reuse the `copied` pattern from Settings). Kept as a bonus for group chats, but the live banner (§11) is now the primary nudge, so this is no longer load-bearing.

Empty states: if no travelers yet, prompt to add them in Settings (link), like BudgetPage links to Settings when no budget exists.

---

## 9. Navigation & routing

- `src/components/layout/TabNav.tsx`: add a **Split** tab (icon: users/people or a split-arrows glyph). Show it conditionally only when `trip.split_enabled` is true — read the trip in TabNav or gate the route and hide the item. Keep the tab count reasonable; consider ordering it right after Budget.
- `src/App.tsx`: add the `/split` route → `SplitPage`, wrapped in `RequireAuth`/owner layout like the other owner pages.
- If `split_enabled` is false, `/split` should redirect to `/budget` or `/overview`.

---

## 10. Membership — how travelers join and participate

Everyone on the trip already logs in (invite-only beta), so split uses **real accounts** through a light membership layer. This replaces the anonymous "tap your name" idea from earlier drafts.

**Prerequisite (fix regardless of split): the share-link 404.** Today a cold browser hitting `/trip/{shareCode}` 404s, and the link only resolves once the PWA is installed. The SPA fallback (`_redirects` = `/*  /index.html  200`) is correct in the repo, so the fault is at the deploy/host layer (fallback not applied on that domain, or the link is opened outside the app scope). Members can't onboard smoothly until a person can open a share link in a plain browser and land in the app. Treat this as step 0.

**The core gap today.** The app has exactly two states: *owner of this trip* (authenticated, full access) or *anonymous link-holder* (the `/trip/:shareCode` guest layout renders for everyone, logged in or not). There is **no "member" concept** — so even a logged-in person viewing someone else's shared trip is served anonymously, with their account and their view of that trip completely disconnected. Membership closes that gap.

**Concepts.**
- `trips.owner_uid` = the owner (unchanged).
- `trip_members(trip_id, user_id)` = authenticated participants of a trip they don't own.
- `travelers` = the roster the owner builds. A traveler row **may** link to an account via `travelers.user_id`:
  - linked → that account "is" this traveler (Kevin logs in, claims "Kevin").
  - `NULL` → a **proxy traveler** (e.g. Grandma Pat, who never logs in); the owner or any member logs her expenses for her. Nobody is forced to create an account.

**Join flow.**
1. Owner enables Split (premium) and builds the roster in Settings — optionally entering each traveler's **email** so their spot auto-claims on join.
2. Owner shares the existing share link.
3. A participant opens it:
   - **Not logged in** → prompt to log in (participation needs an account; matches how the beta already works). Read-only tabs can still render anonymously as they do now.
   - **Logged in** → auto-enroll: upsert a `trip_members` row for `(trip_id, auth.uid())`. Then **claim a roster spot** — auto-match by email if the owner entered it, otherwise a one-time "Which one are you?" picker — setting `travelers.user_id = auth.uid()`.
4. Now a member: they reach the **member Split view** and act **as themselves** — add expenses (`paid_by` = their traveler), pay via deep link, mark their own row settled. No edit/delete of others (owner-only).

**Access = RLS via membership** (see the sketch in §4). Authenticated member queries are scoped by the `trip_members` predicate; this replaces the anonymous `guest_*` write functions from earlier drafts. The existing anonymous `guest_*` read functions for the *other* tabs (days, route, etc.) are untouched.

**Routing.** Keep the share link as the single front door but make it **auth-aware**:
- Logged-in visitor to `/trip/:shareCode` → enroll + render the member Split experience (with write). Simplest is to teach `GuestLayout` to detect a session and, when present + `share_split`, surface the member Split tab; or route members to a dedicated authenticated `/m/:tripId/split`. Recommend the auth-aware share link so there's one URL to share.
- Anonymous visitor → today's read-only guest tabs, plus a "Log in to join the split" prompt.

**`share_split`** still governs whether split is visible/joinable through the link. **Pay handles** are visible to members (they're all trusted participants) but never need to reach a truly anonymous viewer.

---

## 11. Live reminders (in-app banner) — v1

Replaces the spreadsheet's manual copy-paste so **nobody is responsible for nagging**. Pure client-side; zero backend.

A shared `<SettleBanner>` component computes, from `computeBalances` + `travelerStatus`:
- If everyone is settled -> "Everyone's settled" (sage).
- Else -> a one-line summary of who still owes, worst-first, with deadline status, e.g. "Linda owes $419 (OVERDUE) · Kevin owes $88 (due in 3d)" (terracotta if any overdue, gold if only due-soon).

Show it at the top of the **owner Split tab**, on **Home / Overview**, and in the **member Split view** — so anyone who opens the trip sees the current truth without anyone sending a message.

**Deferred fast-follows (not v1):** because members are real accounts, PWA web push becomes reliable (you know whose device is whose) — needs a service-worker push handler, VAPID keys, a subscriptions table, and a scheduled Supabase edge function near the deadline (iOS requires the PWA installed to the home screen). Email/SMS reminders need contact fields + a provider + a cron job. The data model already carries what these need.

---

## 12. Premium gate (one gate, whole app)

- **Only the owner's unlock matters — "free to join, pay to plan" (permanent, post-beta too).** The owner's premium turns Split on for the trip; **members participate free forever** under that trip and never hit a paywall for joining someone else's trip. A free account is all a member needs; payment is required only to own/plan a trip. Do not gate member actions (join, add expense, pay, mark settled) on `isPremium`.
- **Storage:** a `profiles` table keyed by `auth.uid()` with `is_premium boolean` (+ optional `license_code text`); redeeming an Etsy license code flips it. Dev override (env/localStorage) so you can build unlocked.
- **Hook:** `src/hooks/usePremium.ts` -> `{ isPremium, loading }`, cached.
- **Enforcement:** the Settings "Group Split" enable toggle and the owner `/split` route require `isPremium`. Member access requires only `trip_members` + `share_split` (inherits the owner's unlock).
- **Do not** add a second gate for split.

---

## 13. Build order for Claude Code

0. **Fix the share-link 404** (deploy/SPA-fallback) so links open in a cold browser. Prerequisite for member onboarding.
1. Migration `011_split_budget.sql` — `travelers` (incl. `email`, `user_id`), `trip_members`, `split_expenses`, `trips` columns (incl. `share_split`), and **owner + member RLS** (§4).
2. Types in `src/types/index.ts` (+ extend `database.ts` if used).
3. `src/lib/splitMath.ts` + unit test (`splitMath.test.ts`) — verify against the Example numbers (§15).
4. `usePremium` hook + `profiles` entitlement (dev override).
5. Settings "Group Split" card: enable toggle (gated), currency, deadline, roster CRUD **with optional emails**, `share_split` toggle.
6. `SplitPage.tsx` (owner) + shared `SettleBanner`.
7. **Membership:** auth-aware share-link enroll + claim-a-traveler UI + the member Split view (RLS-scoped writes).
8. `TabNav` + `App` route for the owner Split tab (`split_enabled && isPremium`) and the member route.
9. Drop `SettleBanner` on Home/Overview.
10. Verification pass (§15).

### Rollout & no-breakage (important for existing users)

These changes are **additive and safe** for people already using a shared trip (e.g. existing members with the PWA installed):
- **Migration 011 only adds** tables/columns, all defaulting off (`split_enabled`, `share_split` = false). It alters/drops nothing, so existing trips, data, and the current guest view keep working untouched.
- **No reinstall, no re-login.** The app is `registerType: 'autoUpdate'` (vite-plugin-pwa), so the new build replaces the old one automatically — typically on next open. Home-screen installs and Supabase sessions persist. Worst case is a one-time close-and-reopen to pick up the latest.
- **Split is invisible until the owner turns it on** for a trip and builds the roster. Enabling it adds capability; it never removes what members already see.
- **To become a member**, an existing user simply opens the owner's share link once while logged in (auto-enroll + claim) — a tap, not a reinstall.
- Ship split behind the default-off flags, deploy, then enable on a test trip before announcing.

---

## 14. Future enhancements (out of v1)

- **Push + email/SMS reminders** (banner is v1; §11 lists what each adds) — now reliable thanks to real member identity.
- **Invite by email/SMS** from the roster (send the join link directly) instead of the owner pasting it.
- **Envelope bridge:** optionally push a member's share into their matching personal envelope (Lodging -> hotel card). Deferred to avoid double-counting.
- **Multi-currency / FX**, and **partial payments** against a settle-up transfer (v1 settles in full only).

---

## 15. Verification checklist

Golden test for `splitMath.ts` — the spreadsheet's **Example** tab. Travelers: Smith (party 5, wt 2), Jones (2, 2), Lee (3, 2), Grandma Pat (1, 1). Expected:

| Traveler | Paid in | Fair share | Balance |
|---|---|---|---|
| Smith | 2530 | 1576.53 | +953.47 (gets back) |
| Jones | 720 | 768.44 | -48.44 (owes) |
| Lee | 552 | 1037.81 | -485.81 (owes) |
| Grandma Pat | 0 | 419.22 | -419.22 (owes) |

Settle-up: Lee -> Smith 485.81, Grandma Pat -> Smith 419.22, Jones -> Smith 48.44. Total spend 3802.

Also verify:
- Pay links open the right app + amount; "OVERDUE / due in Nd" flips around the deadline; banner matches balances.
- **Membership:** a logged-in visitor to the share link is enrolled and can claim a roster spot (auto by email, else picker); a member adds an expense *as themselves*; a member can mark only *their own* row settled; the owner can log for a proxy traveler and mark anyone; a non-member / anonymous user cannot write; RLS blocks reading or writing a trip you're not a member/owner of.
- **404 fix:** a share link opens in a plain browser without the PWA pre-installed.
- The solo **Budget** tab is unchanged; owner Split tab hidden unless `split_enabled && isPremium`; split hidden/anon-blocked unless `share_split`.

---

## 16. Files touched (summary)

**New:** `supabase/migrations/011_split_budget.sql`, `src/lib/splitMath.ts`, `src/lib/splitMath.test.ts`, `src/pages/owner/SplitPage.tsx`, member Split view (e.g. `src/pages/member/MemberSplitPage.tsx` or an auth-aware branch of the guest split view), `src/components/split/SettleBanner.tsx`, claim-a-traveler component, `src/hooks/usePremium.ts`, `src/hooks/useTripMembership.ts` (enroll/claim).

**Edited:** `src/types/index.ts` (+`database.ts`), `src/pages/owner/SettingsPage.tsx` (roster + emails + `share_split`), `src/pages/owner/OverviewPage.tsx` (banner), `src/components/layout/TabNav.tsx`, `src/App.tsx` (auth-aware share route + member route), `src/pages/guest/GuestLayout.tsx` (detect session + "join the split" prompt), and the deploy config / `_redirects` handling for the 404 fix.

**Untouched:** `src/pages/owner/BudgetPage.tsx` and the `budget` / `spending_log` tables — the solo envelope experience stays exactly as it is.
