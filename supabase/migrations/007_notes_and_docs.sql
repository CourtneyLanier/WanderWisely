-- WanderWisely — Migration 007: Notes & Documents
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS trip_notes (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id    uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title      text        NOT NULL DEFAULT 'Note',
  content    text        NOT NULL DEFAULT '',
  sort_order int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trip_documents (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id    uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title      text        NOT NULL,
  doc_type   text        NOT NULL DEFAULT 'other'
               CHECK (doc_type IN ('itinerary', 'side_quest', 'packing_list', 'other')),
  content    text        NOT NULL DEFAULT '',
  url        text,
  sort_order int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_trip_notes_trip_id     ON trip_notes(trip_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_trip_documents_trip_id ON trip_documents(trip_id, sort_order);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE trip_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_documents ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- POLICIES
-- ============================================================

CREATE POLICY "owner_all_trip_notes" ON trip_notes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = trip_notes.trip_id AND t.owner_uid = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = trip_notes.trip_id AND t.owner_uid = auth.uid())
  );

CREATE POLICY "owner_all_trip_documents" ON trip_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = trip_documents.trip_id AND t.owner_uid = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = trip_documents.trip_id AND t.owner_uid = auth.uid())
  );
