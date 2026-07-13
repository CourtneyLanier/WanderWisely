# Split Feature — Build Progress

Running checklist for the Split ("Trip Treasurer") feature. Blueprint: `docs/Split-Budget-Blueprint.md`.
Updated continuously as phases complete. Each phase is checked off only after typecheck + tests + build pass.

## Pre-flight (done)
- [x] Blueprint read in full
- [x] §2 verified: `budget`/`spending_log` match; Split is a separate additive model
- [x] §4 verified: migration style + `owner_all_*` RLS pattern confirmed (001, 009, 010)
- [x] §10 verified: owner/anonymous only today, no member concept; PWA is `autoUpdate`
- [x] 404 root cause found: `_redirects` at repo root — Vite only ships `public/` to `dist`, so Netlify never saw it
- [x] §15 golden inputs derived (xlsx not in repo): even=280 + party_size=2963 + custom=559 = 3802 reproduces every expected number exactly
- [x] Note: repo has no test runner → adding vitest (dev-only). No linter configured → `tsc` (runs in `npm run build`) is the lint gate.

## Phases (§13 build order)
- [x] **0. Share-link 404 fix** — moved `_redirects` → `public/_redirects` (verified in dist)
- [x] **1. Migration `011_split_budget.sql`** — written & reviewed; NOT applied to Supabase (pause point)
- [x] **2. Types** — `src/types/index.ts` + `database.ts` (tsc clean)
- [x] **3. `splitMath.ts` + golden tests** — 26/26 vitest tests pass incl. every §15 number and transfer order
- [x] **4. `usePremium` hook** — profiles entitlement + dev override (`VITE_PREMIUM_OVERRIDE` / localStorage `ww-premium-override`)
- [x] **5. Settings "Group Split" card** — gated toggle, currency, deadline, `share_split`, roster CRUD (≤8, emails, reorder, pay handles stripped of @/$)
- [x] **6. `SplitPage` (owner) + `SettleBanner`** — all 7 sections of §8; receipt scan is a sibling of BudgetPage's flow (same edge fn) because §16 keeps BudgetPage untouched
- [x] **7. Membership** — `useTripMembership` (auto-enroll via `join_trip_via_share_code`), `ClaimTraveler` picker (email auto-claim happens server-side), `GuestSplitPage` member view; anonymous visitors get "log in to join"
- [x] **8. Nav + routes** — owner Split tab after Budget (`split_enabled && isPremium`), `/split` route redirects to `/budget` when off; guest Split tab when `share_split`
- [x] **9. Banner on Overview + verification pass (§15)** — see below

## Verification results
- TypeScript: clean (`tsc --noEmit`, also runs inside `npm run build`)
- Tests: **26/26 pass** — §15 golden numbers exact (balances, transfer order, total), all 3 split methods, pay links, deadline flips, group message
- Build: succeeds; `dist/_redirects` confirmed shipped (404 fix verified)
- Constraint audit: `BudgetPage.tsx` + `budget`/`spending_log` untouched (git-verified) · migration additive, flags default OFF · no member action gated on premium · real membership (trip_members + claim)

## Notable decisions (blueprint ambiguities resolved)
- §8 "reuse ReceiptScanFlow" vs §16 "BudgetPage untouched" → §16 wins; Split has its own scan that calls the same `parse-with-claude` edge function and prefills the expense form
- `join_trip_via_share_code` also requires `split_enabled` (not just `share_split`), and `guest_get_trip` returns `share_split AND split_enabled` — one source of truth for "joinable"
- Members can also fix their own pay handle (RLS allows updating their own row, not just `settled`) — row scope is the enforced boundary
- Golden-test expenses reverse-engineered (xlsx not in repo); documented in the test header

## Paused for Courtney (live infrastructure — written & verified locally, NOT applied)
- [ ] Apply migration 011 to Supabase
- [ ] Deploy to production (Netlify)

## Hard-constraint audit (checked at the end, tracked throughout)
- Solo Budget tab + `budget`/`spending_log` untouched
- Migration additive only; `split_enabled` / `share_split` default false
- No member action gated on premium ("free to join, pay to plan")
- Real membership model (trip_members + claim), not anonymous
