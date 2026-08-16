# Auth: opening and closing public signup

**Current state: signup is OPEN.** Anyone with the app link can create an account.

This is the runbook for flipping that in either direction. Read it before
touching either switch — the failure mode here is quiet and confusing, and it
has already caused one round of head-scratching.

---

## The one thing to understand

The gate is **two independent switches that must agree**. Neither one alone
controls anything useful.

| # | Switch | Where it lives | Who can change it |
|---|--------|----------------|-------------------|
| 1 | `shouldCreateUser` on the `signInWithOtp` call | `src/pages/auth/LoginPage.tsx` — in the repo, ships with the Netlify deploy | anyone with a PR |
| 2 | **Allow new users to sign up** | Supabase dashboard → Authentication → Sign In / Providers → User Signups | project owner only |

Switch 2 is the real enforcement — it's server-side and can't be bypassed by a
browser. Switch 1 is the client *asking* for account creation. If the client
never asks, the server never creates, no matter how switch 2 is set.

**That is the trap:** the dashboard toggle looks like it's in charge, but
turning it on while the deployed code still says `shouldCreateUser: false`
changes nothing at all. The app keeps rejecting new users and the dashboard
keeps insisting signup is allowed. Nothing logs an error, because from
Supabase's point of view the client asked for exactly what it got.

### What is *not* the gate

Worth stating so nobody goes hunting again. There is **no** allowlist table,
**no** `handle_new_user` trigger on `auth.users`, and **no** edge function that
checks emails. The only tables are the 13 trip/split tables from migrations
001–014. Signup access is entirely the two switches above — nothing in Postgres
restricts who can sign up.

The RLS policies (`owner_all_*`, `is_trip_member`, `own_profile_all`) are what
keep users out of *each other's* trips. They are unrelated to signup and must
never be touched as part of an open/close flip.

---

## To close signup again (back to private beta)

Both switches move, **code first**:

1. **Revert the code and deploy it.** The open-signup change is deliberately
   one self-contained commit, so a plain revert restores the whole gate:
   ```
   git revert $(git log --format=%H --grep="^Auth: open signup" -1)
   ```
   That restores `shouldCreateUser: false`, the "We're in private beta" screen,
   and the beta notice on the form — nothing else. (This file is **not** in
   that commit, so it survives the revert. Update the state line at the top
   afterward.) Push, merge to `main`, let Netlify deploy, and confirm the new
   build is actually live before step 2.

2. **Then** turn **off** Supabase → Authentication → Sign In / Providers →
   "Allow new users to sign up". Click **Save changes** and reload the page to
   confirm it stuck.

**Why this order.** Between the two steps, the deployed client is already
sending `shouldCreateUser: false` while the server still permits signups.
Supabase responds to an unknown email with a "Signups not allowed for otp"
error, which the reverted code catches and renders as the friendly private-beta
screen. So the in-between state looks correct to a user.

Do it in the other order and you get an ugly window: the still-open code asks
to create an account, the now-closed server refuses, and the error string falls
through to the raw red error box, because the code that translates that
message into the nice screen hasn't shipped yet.

### Adding testers while closed

With signup off, accounts are created by hand: Supabase dashboard →
Authentication → Users → **Add user**. They can then use the magic-link form
normally, since sign-*in* for existing users is never gated.

---

## To open signup (what was done on 2026-08-16)

Same two switches, **opposite order — dashboard first**:

1. Turn **on** "Allow new users to sign up", save, reload to confirm.
2. Then remove `shouldCreateUser: false` and the private-beta UI, and deploy.

Same reasoning inverted: deploying the open code first, while the server is
still closed, is the ugly-raw-error window.

---

## Verifying it actually works

Don't test with your own address — you already have an account, so sign-*in*
succeeds and proves nothing about signup. Use an email that has never touched
the app (a `+tag` alias works: `you+test1@…`). Delete the resulting user from
Authentication → Users afterward.

Two more things that break "just send them the link", neither of them the gate:

- **Redirect URLs** must include `https://app.wanderwisely.app/auth/callback`
  (Authentication → URL Configuration). If it's missing, Supabase mails the
  link to the site root instead. `RootRedirect` in `src/App.tsx` catches the
  token there and forwards it, so this degrades rather than breaks — but fix it
  properly rather than leaning on the fallback.
- **Email sending limits.** Supabase's built-in SMTP allows only a handful of
  messages per hour and is not intended for production. Past that, magic links
  silently never arrive — no error anywhere, the user just waits. If the app is
  open to the public, configure a real SMTP provider under Authentication →
  Emails → SMTP Settings.

---

## What a new free account can reach

Signing up grants a normal account with no `profiles` row (nothing creates one
— there's no signup trigger). `usePremium` reads that missing row as
`is_premium: false` via `maybeSingle()`, which is handled and does not error.

`isPremium` gates exactly one thing: the **Split** tab (`TabNav.tsx`,
`GroupSplitSettings.tsx`, `SplitPage.tsx`). Everything else — creating trips,
days, lodging, activities, reservations, budget, notes, documents, map, export
— is open to any signed-in user. That's the intended "free to join, pay to
plan" shape from the Split blueprint, but it does mean opening signup gives
strangers full trip-planning access. If that should ever change, the gate to
add is on trip *creation*, not on signup.
