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
- [ ] **0. Share-link 404 fix** — move `_redirects` → `public/_redirects`, verify in dist
- [ ] **1. Migration `011_split_budget.sql`** — trips columns (all default OFF), `travelers`, `trip_members`, `split_expenses`, `profiles` (premium), owner + member RLS, `join_trip_via_share_code` / `claim_traveler` fns, `guest_get_trip` returns `share_split`
- [ ] **2. Types** — `src/types/index.ts` + `database.ts`
- [ ] **3. `splitMath.ts` + golden tests** — vitest, §15 numbers (show output first run)
- [ ] **4. `usePremium` hook** — profiles entitlement + dev override
- [ ] **5. Settings "Group Split" card** — gated toggle, currency, deadline, `share_split`, roster CRUD (≤8, emails)
- [ ] **6. `SplitPage` (owner) + `SettleBanner`** — banner, log form + receipt scan, list, balances, settle-up + Pay links, category totals, copy message
- [ ] **7. Membership** — auto-enroll on share link, claim-a-traveler (email auto-match else picker), member Split view
- [ ] **8. Nav + routes** — Split tab (`split_enabled && isPremium`), `/split` route + redirect
- [ ] **9. Banner on Overview + verification pass (§15)**

## Paused for Courtney (live infrastructure — written & verified locally, NOT applied)
- [ ] Apply migration 011 to Supabase
- [ ] Deploy to production (Netlify)

## Hard-constraint audit (checked at the end, tracked throughout)
- Solo Budget tab + `budget`/`spending_log` untouched
- Migration additive only; `split_enabled` / `share_split` default false
- No member action gated on premium ("free to join, pay to plan")
- Real membership model (trip_members + claim), not anonymous
