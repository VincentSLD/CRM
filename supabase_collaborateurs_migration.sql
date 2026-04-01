-- Table des collaborateurs Akuiteo
CREATE TABLE IF NOT EXISTS collaborateurs (
  id TEXT PRIMARY KEY,
  akuiteo_id TEXT,
  code TEXT,
  nom TEXT NOT NULL,
  prenom TEXT,
  titre TEXT,
  email TEXT,
  telephone TEXT,
  mobile TEXT,
  fonction TEXT,
  externe BOOLEAN DEFAULT false,
  generique BOOLEAN DEFAULT false,
  cadre BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE collaborateurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collaborateurs_all" ON collaborateurs FOR ALL USING (true) WITH CHECK (true);
