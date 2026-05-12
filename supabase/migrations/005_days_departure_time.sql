-- Migration 005: Add departure_time to days table
-- The app code references this column but it was missing from the initial schema.
-- Run in Supabase Dashboard > SQL Editor > New Query

ALTER TABLE days
  ADD COLUMN IF NOT EXISTS departure_time time;

-- Update the guest_get_days function to expose departure_time to guests
-- Must drop first because the return type (row shape) is changing
DROP FUNCTION IF EXISTS public.guest_get_days(text);

CREATE OR REPLACE FUNCTION public.guest_get_days(p_share_code text)
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
  ORDER BY d.day_number;
$$;
