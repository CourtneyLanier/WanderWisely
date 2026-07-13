-- WanderWisely — Migration 011: Group Split budget ("Trip Treasurer")
-- Adds the group expense-splitting feature alongside the solo envelope budget.
-- STRICTLY ADDITIVE: new tables + new trips columns, every flag defaults OFF,
-- nothing existing is altered or dropped (guest_get_trip is recreated with one
-- extra column, following the migration 009 pattern). Existing trips, data,
-- and the current guest view keep working untouched.
--
-- Every statement is idempotent — safe to re-run top to bottom.
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query).

-- ============================================================
-- TRIPS COLUMNS — split settings (all default off / empty)
-- ============================================================

ALTER TABLE trips ADD COLUMN IF NOT EXISTS split_enabled  boolean NOT NULL DEFAULT false;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS split_currency text    NOT NULL DEFAULT '$';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS split_deadline date;              -- settle-up deadline, nullable
ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_split    boolean NOT NULL DEFAULT false; -- split visible/joinable via share link


-- ============================================================
-- TABLES
-- ============================================================

-- Travelers: the roster the owner builds (up to 8 per trip, enforced in UI).
-- A row MAY link to an account via user_id (member claimed their spot);
-- user_id NULL = proxy traveler (e.g. Grandma Pat) — others log for them.
CREATE TABLE IF NOT EXISTS travelers (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id       uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  party_size    int         NOT NULL DEFAULT 1,         -- powers "By party size"
  pay_app       text        CHECK (pay_app IN ('venmo', 'paypal', 'cashapp', 'other') OR pay_app IS NULL),
  pay_handle    text,                                    -- stored WITHOUT leading @ or $
  custom_weight numeric(10,2) NOT NULL DEFAULT 1,        -- powers "Custom %"
  settled       boolean     NOT NULL DEFAULT false,      -- Dashboard "Paid?" column
  email         text,                                    -- optional; lets a member auto-claim this spot
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  sort_order    int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Trip membership: links an authenticated NON-owner user to a trip they
-- participate in. (The owner is trips.owner_uid — no row needed here.)
CREATE TABLE IF NOT EXISTS trip_members (
  id        uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id   uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text        NOT NULL DEFAULT 'member' CHECK (role IN ('member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id)
);

-- Split expenses (one cost per row).
-- shared_with as uuid[] avoids a join table — fine for <=8 travelers and
-- mirrors the spreadsheet's per-row checkbox columns (G:N).
CREATE TABLE IF NOT EXISTS split_expenses (
  id           uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id      uuid          NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  spent_on     date,
  description  text,
  category     text,                                     -- Lodging/Food/Transportation/Gas/Activities/Shopping/Other
  paid_by      uuid          REFERENCES travelers(id) ON DELETE SET NULL,
  amount       numeric(10,2) NOT NULL DEFAULT 0,
  split_method text          NOT NULL DEFAULT 'even'
                 CHECK (split_method IN ('even', 'party_size', 'custom')),
  shared_with  uuid[]        NOT NULL DEFAULT '{}',      -- traveler ids sharing this cost
  created_at   timestamptz   NOT NULL DEFAULT now()
);

-- Premium entitlement (one gate for the whole app — "free to join, pay to plan").
-- Only trip OWNERS ever need is_premium; members never do.
CREATE TABLE IF NOT EXISTS profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_premium   boolean     NOT NULL DEFAULT false,
  license_code text,
  created_at   timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_travelers_trip      ON travelers(trip_id);
CREATE INDEX IF NOT EXISTS idx_travelers_user      ON travelers(user_id);
CREATE INDEX IF NOT EXISTS idx_split_expenses_trip ON split_expenses(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_trip   ON trip_members(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_user   ON trip_members(user_id);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE travelers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;

-- ── Owner policies (mirror the owner_all_* pattern from 001) ──

DROP POLICY IF EXISTS "owner_all_travelers" ON travelers;
CREATE POLICY "owner_all_travelers" ON travelers
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = travelers.trip_id AND t.owner_uid = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = travelers.trip_id AND t.owner_uid = auth.uid())
  );

DROP POLICY IF EXISTS "owner_all_trip_members" ON trip_members;
CREATE POLICY "owner_all_trip_members" ON trip_members
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = trip_members.trip_id AND t.owner_uid = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = trip_members.trip_id AND t.owner_uid = auth.uid())
  );

DROP POLICY IF EXISTS "owner_all_split_expenses" ON split_expenses;
CREATE POLICY "owner_all_split_expenses" ON split_expenses
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = split_expenses.trip_id AND t.owner_uid = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = split_expenses.trip_id AND t.owner_uid = auth.uid())
  );

-- ── Member policies (a trip_members row for the trip grants access) ──

-- Members may read the trip row (name, split currency/deadline, flags).
DROP POLICY IF EXISTS "member_select_trips" ON trips;
CREATE POLICY "member_select_trips" ON trips
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id = trips.id AND m.user_id = auth.uid())
  );

-- Members may read the roster and all split expenses.
DROP POLICY IF EXISTS "member_select_travelers" ON travelers;
CREATE POLICY "member_select_travelers" ON travelers
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id = travelers.trip_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "member_select_split_expenses" ON split_expenses;
CREATE POLICY "member_select_split_expenses" ON split_expenses
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id = split_expenses.trip_id AND m.user_id = auth.uid())
  );

-- Members may update ONLY their own traveler row (mark settled, fix their
-- pay handle). Row scope is the enforced boundary — it is their own row.
DROP POLICY IF EXISTS "member_update_own_traveler" ON travelers;
CREATE POLICY "member_update_own_traveler" ON travelers
  FOR UPDATE TO authenticated
  USING (
    travelers.user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id = travelers.trip_id AND m.user_id = auth.uid())
  )
  WITH CHECK (
    travelers.user_id = auth.uid()
  );

-- Members may insert expenses paid by their own linked traveler, or by a
-- proxy traveler (user_id IS NULL) on the same trip. No member edit/delete —
-- the owner keeps those (blueprint §10).
DROP POLICY IF EXISTS "member_insert_split_expenses" ON split_expenses;
CREATE POLICY "member_insert_split_expenses" ON split_expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id = split_expenses.trip_id AND m.user_id = auth.uid())
    AND paid_by IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM travelers tv
      WHERE tv.id = split_expenses.paid_by
        AND tv.trip_id = split_expenses.trip_id
        AND (tv.user_id = auth.uid() OR tv.user_id IS NULL)
    )
  );

-- Members may read their own membership rows (lets the client detect
-- "am I already a member of this trip?").
DROP POLICY IF EXISTS "member_select_own_membership" ON trip_members;
CREATE POLICY "member_select_own_membership" ON trip_members
  FOR SELECT TO authenticated
  USING (trip_members.user_id = auth.uid());

-- ── Profiles: each user manages only their own row ──

DROP POLICY IF EXISTS "own_profile_all" ON profiles;
CREATE POLICY "own_profile_all" ON profiles
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ============================================================
-- MEMBERSHIP FUNCTIONS — SECURITY DEFINER, authenticated only
--
-- The client only knows the share code, and RLS (correctly) blocks
-- self-service inserts into trip_members — so joining goes through a
-- definer function that validates the share link first.
-- ============================================================

-- Enroll the calling user as a member of the trip behind a share link.
-- Requires share_enabled AND share_split. Auto-claims a roster spot when the
-- owner entered this user's email. Returns the trip id, or NULL if the code
-- is invalid / split isn't shared. Owner calling it is a no-op (returns id).
CREATE OR REPLACE FUNCTION public.join_trip_via_share_code(p_share_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id  uuid;
  v_owner    uuid;
  v_email    text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT t.id, t.owner_uid INTO v_trip_id, v_owner
  FROM trips t
  WHERE t.share_code = p_share_code
    AND t.share_enabled = true
    AND t.share_split = true;

  IF v_trip_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- The owner is not a member; they already have full access.
  IF v_owner = auth.uid() THEN
    RETURN v_trip_id;
  END IF;

  INSERT INTO trip_members (trip_id, user_id)
  VALUES (v_trip_id, auth.uid())
  ON CONFLICT (trip_id, user_id) DO NOTHING;

  -- Auto-claim a roster spot by email (only if this user hasn't claimed one).
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  IF v_email IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM travelers tv WHERE tv.trip_id = v_trip_id AND tv.user_id = auth.uid()
  ) THEN
    UPDATE travelers tv
    SET user_id = auth.uid()
    WHERE tv.id = (
      SELECT tv2.id FROM travelers tv2
      WHERE tv2.trip_id = v_trip_id
        AND tv2.user_id IS NULL
        AND lower(tv2.email) = lower(v_email)
      ORDER BY tv2.sort_order
      LIMIT 1
    );
  END IF;

  RETURN v_trip_id;
END;
$$;

-- Claim a specific roster spot (the "Which one are you?" picker).
-- Only unclaimed travelers on a trip the caller is a member of; one claim
-- per user per trip. Returns true when the claim succeeded.
CREATE OR REPLACE FUNCTION public.claim_traveler(p_traveler_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT tv.trip_id INTO v_trip_id
  FROM travelers tv
  WHERE tv.id = p_traveler_id
    AND tv.user_id IS NULL;

  IF v_trip_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM trip_members m WHERE m.trip_id = v_trip_id AND m.user_id = auth.uid()
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM travelers tv WHERE tv.trip_id = v_trip_id AND tv.user_id = auth.uid()
  ) THEN
    RETURN false;
  END IF;

  UPDATE travelers SET user_id = auth.uid() WHERE id = p_traveler_id AND user_id IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_trip_via_share_code(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.claim_traveler(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.join_trip_via_share_code(text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_traveler(uuid) TO authenticated;


-- ============================================================
-- guest_get_trip — recreated with share_split so the anonymous guest
-- view knows whether to show the "Log in to join the split" prompt.
-- (Same drop/recreate pattern as migration 009; no data touched.)
-- ============================================================

DROP FUNCTION IF EXISTS public.guest_get_trip(text);

CREATE FUNCTION public.guest_get_trip(p_share_code text)
RETURNS TABLE (
  id            uuid,
  name          text,
  start_date    date,
  end_date      date,
  num_days      int,
  share_code    text,
  share_enabled bool,
  created_at    timestamptz,
  share_days    bool,
  share_route   bool,
  share_wallet  bool,
  share_budget  bool,
  share_notes   bool,
  share_map     bool,
  share_split   bool
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, start_date, end_date, num_days, share_code, share_enabled, created_at,
         share_days, share_route, share_wallet, share_budget, share_notes, share_map,
         share_split
  FROM trips
  WHERE share_code = p_share_code
    AND share_enabled = true;
$$;

-- Dropped functions lose their grants — re-grant.
GRANT EXECUTE ON FUNCTION public.guest_get_trip(text) TO anon;
