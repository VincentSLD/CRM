-- ================================================
-- CRM Akuiteo — Table Contacts (liés aux clients)
-- Exécuter dans : Supabase > SQL Editor > New Query
-- ================================================

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  akuiteo_id TEXT,
  akuiteo_customer_id TEXT,
  code TEXT,
  nom TEXT NOT NULL DEFAULT '',
  prenom TEXT DEFAULT '',
  titre TEXT DEFAULT '',
  fonction TEXT DEFAULT '',
  service TEXT DEFAULT '',
  email TEXT DEFAULT '',
  email2 TEXT DEFAULT '',
  telephone TEXT DEFAULT '',
  mobile TEXT DEFAULT '',
  adresse TEXT DEFAULT '',
  code_postal TEXT DEFAULT '',
  ville TEXT DEFAULT '',
  commentaire TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour recherche rapide par client
CREATE INDEX IF NOT EXISTS idx_contacts_client_id ON contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_contacts_akuiteo_id ON contacts(akuiteo_id);

-- RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users full access" ON contacts FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
