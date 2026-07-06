-- WanderWisely — Migration 009: Per-trip guest share tabs
-- Each tab of the guest view is individually toggleable per trip.
-- Defaults preserve today's behavior exactly: Days + Route shared, all else private.
-- Enforcement lives HERE (in the SECURITY DEFINER functions), not in the UI —
-- a guest poking the API directly gets nothing a flag doesn't allow.
--
-- Every function below is DROPped and recreated (return types change or may
-- drift), and every statement is idempotent — safe to re-run top to bottom.
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query).

-- ============================================================
-- COLUMNS — one flag per guest tab (Home is always visible)
-- ============================================================

ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_days   bool NOT NULL DEFAULT true;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_route  bool NOT NULL DEFAULT true;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_wallet bool NOT NULL DEFAULT false;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_budget bool NOT NULL DEFAULT false;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_notes  bool NOT NULL DEFAULT false;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_map    bool NOT NULL DEFAULT false;

-- ============================================================
-- guest_get_trip — now returns the flags so the guest UI knows
-- which tabs to render
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
  share_map     bool
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, start_date, end_date, num_days, share_code, share_enabled, created_at,
         share_days, share_route, share_wallet, share_budget, share_notes, share_map
  FROM trips
  WHERE share_code = p_share_code
    AND share_enabled = true;
$$;

-- ============================================================
-- guest_get_days — keeps departure_time (added in migration 005).
-- Days data feeds the Days, Route, AND Map tabs, so it is available
-- if any of those three are shared.
-- ============================================================

DROP FUNCTION IF EXISTS public.guest_get_days(text);

CREATE FUNCTION public.guest_get_days(p_share_code text)
RETURNS TABLE (
  id             uuid,
  trip_id        uuid,
  day_number     int,
  date           date,
  departure_time time,
  start_location text,
  end_location   text,
  drive_miles    int,
  drive_hours    decimal,
  notes          text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.trip_id, d.day_number, d.date,
         d.departure_time,
         d.start_location, d.end_location,
         d.drive_miles, d.drive_hours, d.notes
  FROM days d
  JOIN trips t ON t.id = d.trip_id
  WHERE t.share_code = p_share_code
    AND t.share_enabled = true
    AND (t.share_days OR t.share_route OR t.share_map)
  ORDER BY d.day_number;
$$;

-- ============================================================
-- guest_get_lodging / guest_get_activities — Days-tab detail
-- ============================================================

DROP FUNCTION IF EXISTS public.guest_get_lodging(text);

CREATE FUNCTION public.guest_get_lodging(p_share_code text)
RETURNS TABLE (
  id                  uuid,
  day_id              uuid,
  name                text,
  type                text,
  address             text,
  listing_url         text,
  confirmation_number text,
  check_in_time       time,
  check_out_time      time,
  bedrooms            int,
  bathrooms           decimal,
  beds                int,
  room_type           text,
  notes               text
  -- nightly_rate and total_cost intentionally excluded
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.day_id, l.name, l.type, l.address, l.listing_url,
         l.confirmation_number, l.check_in_time, l.check_out_time,
         l.bedrooms, l.bathrooms, l.beds, l.room_type, l.notes
  FROM lodging l
  JOIN days d ON d.id = l.day_id
  JOIN trips t ON t.id = d.trip_id
  WHERE t.share_code = p_share_code
    AND t.share_enabled = true
    AND t.share_days;
$$;

DROP FUNCTION IF EXISTS public.guest_get_activities(text);

CREATE FUNCTION public.guest_get_activities(p_share_code text)
RETURNS TABLE (
  id                  uuid,
  day_id              uuid,
  name                text,
  type                text,
  meal_slot           text,
  "time"              time,
  address             text,
  confirmation_number text,
  url                 text,
  notes               text,
  is_booked           bool,
  sort_order          int
  -- estimated_cost intentionally excluded
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.day_id, a.name, a.type, a.meal_slot, a.time,
         a.address, a.confirmation_number, a.url,
         a.notes, a.is_booked, a.sort_order
  FROM activities a
  JOIN days d ON d.id = a.day_id
  JOIN trips t ON t.id = d.trip_id
  WHERE t.share_code = p_share_code
    AND t.share_enabled = true
    AND t.share_days
  ORDER BY d.day_number, a.sort_order, a.time;
$$;

-- ============================================================
-- guest_get_reservations — the Wallet tab
-- ============================================================

DROP FUNCTION IF EXISTS public.guest_get_reservations(text);

CREATE FUNCTION public.guest_get_reservations(p_share_code text)
RETURNS TABLE (
  id                  uuid,
  trip_id             uuid,
  type                text,
  title               text,
  confirmation_number text,
  date                date,
  "time"              time,
  provider            text,
  address             text,
  details             jsonb
  -- cost and raw_email_text intentionally excluded
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.trip_id, r.type, r.title, r.confirmation_number,
         r.date, r.time, r.provider, r.address, r.details
  FROM reservations r
  JOIN trips t ON t.id = r.trip_id
  WHERE t.share_code = p_share_code
    AND t.share_enabled = true
    AND t.share_wallet
  ORDER BY r.date NULLS LAST, r.time NULLS LAST;
$$;

-- ============================================================
-- NEW — Notes tab (notes + document text/links; attached files
-- stay owner-only, so no file_* columns are exposed)
-- ============================================================

DROP FUNCTION IF EXISTS public.guest_get_notes(text);

CREATE FUNCTION public.guest_get_notes(p_share_code text)
RETURNS TABLE (
  id         uuid,
  title      text,
  content    text,
  sort_order int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id, n.title, n.content, n.sort_order
  FROM trip_notes n
  JOIN trips t ON t.id = n.trip_id
  WHERE t.share_code = p_share_code
    AND t.share_enabled = true
    AND t.share_notes
  ORDER BY n.sort_order, n.created_at;
$$;

DROP FUNCTION IF EXISTS public.guest_get_documents(text);

CREATE FUNCTION public.guest_get_documents(p_share_code text)
RETURNS TABLE (
  id         uuid,
  title      text,
  doc_type   text,
  content    text,
  url        text,
  sort_order int
  -- file_path / file_name / file_type / file_size intentionally excluded
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.title, d.doc_type, d.content, d.url, d.sort_order
  FROM trip_documents d
  JOIN trips t ON t.id = d.trip_id
  WHERE t.share_code = p_share_code
    AND t.share_enabled = true
    AND t.share_notes
  ORDER BY d.sort_order, d.created_at;
$$;

-- ============================================================
-- NEW — Budget tab (explicit opt-in; the one place money is ever
-- guest-visible). Summary numbers only — no line items.
-- ============================================================

DROP FUNCTION IF EXISTS public.guest_get_budget(text);

CREATE FUNCTION public.guest_get_budget(p_share_code text)
RETURNS TABLE (
  food_total       decimal,
  food_days        int,
  hotel_buffer     decimal,
  car_total_budget decimal
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.food_total, b.food_days, b.hotel_buffer, b.car_total_budget
  FROM budget b
  JOIN trips t ON t.id = b.trip_id
  WHERE t.share_code = p_share_code
    AND t.share_enabled = true
    AND t.share_budget;
$$;

DROP FUNCTION IF EXISTS public.guest_get_spending_summary(text);

CREATE FUNCTION public.guest_get_spending_summary(p_share_code text)
RETURNS TABLE (
  card  text,
  spent decimal
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.card, SUM(s.amount) AS spent
  FROM spending_log s
  JOIN trips t ON t.id = s.trip_id
  WHERE t.share_code = p_share_code
    AND t.share_enabled = true
    AND t.share_budget
  GROUP BY s.card;
$$;

-- ============================================================
-- GRANTS — dropped functions lose their grants, so re-grant all.
-- anon can only call the guest functions.
-- ============================================================

GRANT EXECUTE ON FUNCTION public.guest_get_trip(text)             TO anon;
GRANT EXECUTE ON FUNCTION public.guest_get_days(text)             TO anon;
GRANT EXECUTE ON FUNCTION public.guest_get_lodging(text)          TO anon;
GRANT EXECUTE ON FUNCTION public.guest_get_activities(text)       TO anon;
GRANT EXECUTE ON FUNCTION public.guest_get_reservations(text)     TO anon;
GRANT EXECUTE ON FUNCTION public.guest_get_notes(text)            TO anon;
GRANT EXECUTE ON FUNCTION public.guest_get_documents(text)        TO anon;
GRANT EXECUTE ON FUNCTION public.guest_get_budget(text)           TO anon;
GRANT EXECUTE ON FUNCTION public.guest_get_spending_summary(text) TO anon;
