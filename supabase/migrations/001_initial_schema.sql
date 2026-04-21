-- WanderWisely — Initial Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- Safe to re-run: uses IF NOT EXISTS where possible

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS trips (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_uid     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  start_date    date,
  end_date      date,
  num_days      int,
  share_code    text        UNIQUE DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  share_enabled bool        NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS days (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id        uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_number     int         NOT NULL,
  date           date,
  start_location text,
  end_location   text,
  drive_miles    int,
  drive_hours    decimal(5,2),
  notes          text,
  UNIQUE (trip_id, day_number)
);

CREATE TABLE IF NOT EXISTS lodging (
  id                  uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_id              uuid        NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  name                text,
  type                text        CHECK (type IN ('hotel', 'airbnb', 'other')),
  address             text,
  listing_url         text,
  confirmation_number text,
  check_in_time       time,
  check_out_time      time,
  bedrooms            int,
  bathrooms           decimal(3,1),
  beds                int,
  room_type           text,
  nightly_rate        decimal(10,2),  -- owner-only: excluded from guest functions
  total_cost          decimal(10,2),  -- owner-only: excluded from guest functions
  notes               text
);

CREATE TABLE IF NOT EXISTS activities (
  id                  uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_id              uuid        NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  name                text,
  type                text        CHECK (type IN ('main', 'side_quest', 'meal', 'reservation')),
  meal_slot           text        CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
  time                time,
  address             text,
  confirmation_number text,
  url                 text,
  estimated_cost      decimal(10,2), -- owner-only: excluded from guest functions
  notes               text,
  is_booked           bool        NOT NULL DEFAULT false,
  sort_order          int         NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reservations (
  id                  uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id             uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  type                text        CHECK (type IN ('flight', 'hotel', 'car', 'restaurant', 'activity', 'other')),
  title               text,
  confirmation_number text,
  date                date,
  time                time,
  provider            text,
  address             text,
  details             jsonb       NOT NULL DEFAULT '{}',
  raw_email_text      text,       -- owner-only: excluded from guest functions
  cost                decimal(10,2) -- owner-only: excluded from guest functions
);

CREATE TABLE IF NOT EXISTS budget (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id          uuid          NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  food_total       decimal(10,2) NOT NULL DEFAULT 0,
  food_days        int           NOT NULL DEFAULT 0,
  hotel_total      decimal(10,2) NOT NULL DEFAULT 0,
  hotel_buffer     decimal(10,2) NOT NULL DEFAULT 500,
  car_total_budget decimal(10,2) NOT NULL DEFAULT 0,
  notes            text,
  UNIQUE (trip_id)
);

CREATE TABLE IF NOT EXISTS spending_log (
  id         uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id    uuid          NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_id     uuid          REFERENCES days(id) ON DELETE SET NULL,
  card       text          NOT NULL CHECK (card IN ('food', 'hotel', 'car')),
  amount     decimal(10,2) NOT NULL,
  label      text,
  logged_at  timestamptz   NOT NULL DEFAULT now(),
  entry_type text          NOT NULL CHECK (entry_type IN ('per_meal', 'daily_total'))
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_days_trip_id        ON days(trip_id);
CREATE INDEX IF NOT EXISTS idx_days_order          ON days(trip_id, day_number);
CREATE INDEX IF NOT EXISTS idx_lodging_day_id      ON lodging(day_id);
CREATE INDEX IF NOT EXISTS idx_activities_day_id   ON activities(day_id);
CREATE INDEX IF NOT EXISTS idx_activities_meal     ON activities(day_id, meal_slot);
CREATE INDEX IF NOT EXISTS idx_activities_order    ON activities(day_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_reservations_trip   ON reservations(trip_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date   ON reservations(trip_id, date);
CREATE INDEX IF NOT EXISTS idx_budget_trip_id      ON budget(trip_id);
CREATE INDEX IF NOT EXISTS idx_spending_trip_id    ON spending_log(trip_id);
CREATE INDEX IF NOT EXISTS idx_spending_day_id     ON spending_log(day_id);
CREATE INDEX IF NOT EXISTS idx_trips_share_code    ON trips(share_code);
CREATE INDEX IF NOT EXISTS idx_trips_owner_uid     ON trips(owner_uid);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE trips        ENABLE ROW LEVEL SECURITY;
ALTER TABLE days         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lodging      ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget       ENABLE ROW LEVEL SECURITY;
ALTER TABLE spending_log ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- OWNER POLICIES  (authenticated role — full CRUD)
-- ============================================================

CREATE POLICY "owner_all_trips" ON trips
  FOR ALL TO authenticated
  USING     (auth.uid() = owner_uid)
  WITH CHECK (auth.uid() = owner_uid);

CREATE POLICY "owner_all_days" ON days
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = days.trip_id AND t.owner_uid = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = days.trip_id AND t.owner_uid = auth.uid())
  );

CREATE POLICY "owner_all_lodging" ON lodging
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM days d
      JOIN trips t ON t.id = d.trip_id
      WHERE d.id = lodging.day_id AND t.owner_uid = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM days d
      JOIN trips t ON t.id = d.trip_id
      WHERE d.id = lodging.day_id AND t.owner_uid = auth.uid()
    )
  );

CREATE POLICY "owner_all_activities" ON activities
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM days d
      JOIN trips t ON t.id = d.trip_id
      WHERE d.id = activities.day_id AND t.owner_uid = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM days d
      JOIN trips t ON t.id = d.trip_id
      WHERE d.id = activities.day_id AND t.owner_uid = auth.uid()
    )
  );

CREATE POLICY "owner_all_reservations" ON reservations
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = reservations.trip_id AND t.owner_uid = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = reservations.trip_id AND t.owner_uid = auth.uid())
  );

CREATE POLICY "owner_all_budget" ON budget
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = budget.trip_id AND t.owner_uid = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = budget.trip_id AND t.owner_uid = auth.uid())
  );

CREATE POLICY "owner_all_spending_log" ON spending_log
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = spending_log.trip_id AND t.owner_uid = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = spending_log.trip_id AND t.owner_uid = auth.uid())
  );


-- ============================================================
-- GUEST ACCESS — SECURITY DEFINER FUNCTIONS
--
-- These run as the function owner (postgres role), bypassing RLS.
-- Each accepts a share_code, validates share_enabled = true,
-- and returns ONLY non-sensitive columns.
-- Called from the React guest route via supabase.rpc('guest_get_*', { p_share_code })
-- ============================================================

CREATE OR REPLACE FUNCTION public.guest_get_trip(p_share_code text)
RETURNS TABLE (
  id            uuid,
  name          text,
  start_date    date,
  end_date      date,
  num_days      int,
  share_code    text,
  share_enabled bool,
  created_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, start_date, end_date, num_days, share_code, share_enabled, created_at
  FROM trips
  WHERE share_code = p_share_code
    AND share_enabled = true;
$$;

CREATE OR REPLACE FUNCTION public.guest_get_days(p_share_code text)
RETURNS TABLE (
  id             uuid,
  trip_id        uuid,
  day_number     int,
  date           date,
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
         d.start_location, d.end_location,
         d.drive_miles, d.drive_hours, d.notes
  FROM days d
  JOIN trips t ON t.id = d.trip_id
  WHERE t.share_code = p_share_code
    AND t.share_enabled = true
  ORDER BY d.day_number;
$$;

CREATE OR REPLACE FUNCTION public.guest_get_lodging(p_share_code text)
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
    AND t.share_enabled = true;
$$;

CREATE OR REPLACE FUNCTION public.guest_get_activities(p_share_code text)
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
  ORDER BY d.day_number, a.sort_order, a.time;
$$;

CREATE OR REPLACE FUNCTION public.guest_get_reservations(p_share_code text)
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
  ORDER BY r.date NULLS LAST, r.time NULLS LAST;
$$;


-- ============================================================
-- GRANTS — anon can ONLY call the guest functions
-- ============================================================

GRANT EXECUTE ON FUNCTION public.guest_get_trip(text)         TO anon;
GRANT EXECUTE ON FUNCTION public.guest_get_days(text)         TO anon;
GRANT EXECUTE ON FUNCTION public.guest_get_lodging(text)      TO anon;
GRANT EXECUTE ON FUNCTION public.guest_get_activities(text)   TO anon;
GRANT EXECUTE ON FUNCTION public.guest_get_reservations(text) TO anon;
