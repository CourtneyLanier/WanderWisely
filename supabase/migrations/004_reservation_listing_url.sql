-- WanderWisely — Migration 004: Add listing_url to reservations
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS listing_url text;
