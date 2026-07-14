-- WanderWisely — Migration 012: HOTFIX for RLS infinite recursion from 011
--
-- Problem: 011's member_select_trips policy (on trips) checks trip_members,
-- and owner_all_trip_members (on trip_members) checks trips. Policy subqueries
-- are themselves subject to RLS, so Postgres hits a trips → trip_members →
-- trips cycle and rejects EVERY trips query with "infinite recursion detected
-- in policy" — which made all trips vanish from the app. No data was touched.
--
-- Fix: the standard pattern — a SECURITY DEFINER helper that reads
-- trip_members WITHOUT invoking RLS. All member policies are recreated on top
-- of it. Every statement is idempotent — safe to re-run top to bottom.
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query).

-- ============================================================
-- HELPER — definer function bypasses RLS, breaking the cycle
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_members m
    WHERE m.trip_id = p_trip_id
      AND m.user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_trip_member(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.is_trip_member(uuid) TO authenticated;

-- ============================================================
-- RECREATE MEMBER POLICIES using the helper (owner policies and
-- everything else from 011 are unchanged)
-- ============================================================

DROP POLICY IF EXISTS "member_select_trips" ON trips;
CREATE POLICY "member_select_trips" ON trips
  FOR SELECT TO authenticated
  USING (public.is_trip_member(trips.id));

DROP POLICY IF EXISTS "member_select_travelers" ON travelers;
CREATE POLICY "member_select_travelers" ON travelers
  FOR SELECT TO authenticated
  USING (public.is_trip_member(travelers.trip_id));

DROP POLICY IF EXISTS "member_select_split_expenses" ON split_expenses;
CREATE POLICY "member_select_split_expenses" ON split_expenses
  FOR SELECT TO authenticated
  USING (public.is_trip_member(split_expenses.trip_id));

DROP POLICY IF EXISTS "member_update_own_traveler" ON travelers;
CREATE POLICY "member_update_own_traveler" ON travelers
  FOR UPDATE TO authenticated
  USING (
    travelers.user_id = auth.uid()
    AND public.is_trip_member(travelers.trip_id)
  )
  WITH CHECK (
    travelers.user_id = auth.uid()
  );

DROP POLICY IF EXISTS "member_insert_split_expenses" ON split_expenses;
CREATE POLICY "member_insert_split_expenses" ON split_expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_trip_member(split_expenses.trip_id)
    AND paid_by IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM travelers tv
      WHERE tv.id = split_expenses.paid_by
        AND tv.trip_id = split_expenses.trip_id
        AND (tv.user_id = auth.uid() OR tv.user_id IS NULL)
    )
  );
