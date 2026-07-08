-- WanderWisely — Migration 010: Optional Misc budget
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Nullable on purpose: NULL means "no budget set" and the Misc card
-- shows spending totals only, with no progress bar or remaining amount.
ALTER TABLE budget ADD COLUMN IF NOT EXISTS misc_total_budget decimal(10,2);
