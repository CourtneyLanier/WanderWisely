-- WanderWisely — Migration 014: Manual weather-location override per day
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query).
--
-- The three-provider geocoder chain (Census → Open-Meteo → Nominatim) plus the
-- coarsening cascade resolves almost everything, but "almost" isn't "always":
-- campground names, trailheads and things like "Mile 42 Going-to-the-Sun Road"
-- can still miss. This is the escape hatch that makes weather predictable
-- rather than merely reliable — type a nearby town and it just works.
--
-- Two columns, not one: a travel day starts and ends in different places, so
-- morning and night have to be overridable independently.

ALTER TABLE days ADD COLUMN IF NOT EXISTS start_weather_location text;
ALTER TABLE days ADD COLUMN IF NOT EXISTS end_weather_location   text;

COMMENT ON COLUMN days.start_weather_location IS
  'Optional override for the 7 AM weather lookup when start_location cannot be geocoded. Falls back to start_location, then the previous night''s hotel address.';

COMMENT ON COLUMN days.end_weather_location IS
  'Optional override for the 9 PM weather lookup when end_location cannot be geocoded. Falls back to end_location, then that night''s hotel address.';

-- ============================================================
-- GUEST RPC  (guest_get_days)
-- ============================================================
-- Guests can't SET an override, but their weather must USE one — otherwise a
-- shared trip shows blanks on exactly the days the owner already fixed. The
-- function has an explicit column list, so adding table columns is not enough;
-- it has to be recreated. Body is otherwise unchanged from migration 009.

DROP FUNCTION IF EXISTS public.guest_get_days(text);

CREATE FUNCTION public.guest_get_days(p_share_code text)
RETURNS TABLE (
  id                     uuid,
  trip_id                uuid,
  day_number             int,
  date                   date,
  departure_time         time,
  start_location         text,
  end_location           text,
  start_weather_location text,
  end_weather_location   text,
  drive_miles            int,
  drive_hours            decimal,
  notes                  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.trip_id, d.day_number, d.date,
         d.departure_time,
         d.start_location, d.end_location,
         d.start_weather_location, d.end_weather_location,
         d.drive_miles, d.drive_hours, d.notes
  FROM days d
  JOIN trips t ON t.id = d.trip_id
  WHERE t.share_code = p_share_code
    AND t.share_enabled = true
    AND (t.share_days OR t.share_route OR t.share_map)
  ORDER BY d.day_number;
$$;

-- Dropping the function drops its grant, so re-grant.
GRANT EXECUTE ON FUNCTION public.guest_get_days(text) TO anon;
