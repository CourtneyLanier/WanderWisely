-- WanderWisely — Migration 003: Add paid tracking to reservations
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false;

-- Index for efficient "show unpaid hotels" queries
CREATE INDEX IF NOT EXISTS idx_reservations_paid ON reservations(trip_id, paid);
