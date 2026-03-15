-- ============================================
-- Migration : Marchés + Affaires
-- Exécuter dans Supabase SQL Editor
-- ============================================

-- =====================
-- TABLE MARCHES
-- =====================
CREATE TABLE IF NOT EXISTS marches (
  id TEXT PRIMARY KEY,
  akuiteo_id TEXT,
  ref TEXT DEFAULT '',
  nom TEXT NOT NULL DEFAULT '',
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT DEFAULT '',
  date_debut DATE,
  date_fin DATE,
  montant NUMERIC DEFAULT 0,
  montant_ttc NUMERIC DEFAULT 0,
  statut TEXT DEFAULT 'en_cours',
  description TEXT DEFAULT '',
  agence TEXT DEFAULT '',
  responsable_id TEXT DEFAULT '',
  commercial_id TEXT DEFAULT '',
  devise TEXT DEFAULT 'EUR',
  reference1 TEXT DEFAULT '',
  nb_affaires INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE marches ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marches' AND policyname='marches_all') THEN
    EXECUTE 'CREATE POLICY marches_all ON marches FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- =====================
-- TABLE AFFAIRES
-- =====================
CREATE TABLE IF NOT EXISTS affaires (
  id TEXT PRIMARY KEY,
  akuiteo_id TEXT,
  ref TEXT DEFAULT '',
  nom TEXT NOT NULL DEFAULT '',
  marche_id TEXT REFERENCES marches(id) ON DELETE SET NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT DEFAULT '',
  date_debut DATE,
  date_fin DATE,
  montant NUMERIC DEFAULT 0,
  montant_ttc NUMERIC DEFAULT 0,
  statut TEXT DEFAULT 'en_cours',
  description TEXT DEFAULT '',
  agence TEXT DEFAULT '',
  responsable_id TEXT DEFAULT '',
  commercial_id TEXT DEFAULT '',
  devise TEXT DEFAULT 'EUR',
  code_projet TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE affaires ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='affaires' AND policyname='affaires_all') THEN
    EXECUTE 'CREATE POLICY affaires_all ON affaires FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- =====================
-- COLONNES affaire_id / marche_id sur devis, commandes, factures
-- =====================
ALTER TABLE devis ADD COLUMN IF NOT EXISTS affaire_id TEXT REFERENCES affaires(id) ON DELETE SET NULL;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS marche_id TEXT REFERENCES marches(id) ON DELETE SET NULL;

ALTER TABLE commandes ADD COLUMN IF NOT EXISTS affaire_id TEXT REFERENCES affaires(id) ON DELETE SET NULL;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS marche_id TEXT REFERENCES marches(id) ON DELETE SET NULL;

ALTER TABLE factures ADD COLUMN IF NOT EXISTS affaire_id TEXT REFERENCES affaires(id) ON DELETE SET NULL;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS marche_id TEXT REFERENCES marches(id) ON DELETE SET NULL;

-- =====================
-- Vérification
-- =====================
SELECT 'OK - Migration Marchés & Affaires complete' AS status;
