-- WanderWisely — Migration 006: Add 'misc' card type to spending_log
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Drop the existing CHECK constraint and replace it with one that includes 'misc'
ALTER TABLE spending_log DROP CONSTRAINT IF EXISTS spending_log_card_check;
ALTER TABLE spending_log ADD CONSTRAINT spending_log_card_check
  CHECK (card IN ('food', 'hotel', 'car', 'misc'));
