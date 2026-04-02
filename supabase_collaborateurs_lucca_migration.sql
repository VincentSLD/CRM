-- Table des collaborateurs Lucca
CREATE TABLE IF NOT EXISTS collaborateurs_lucca (
  id TEXT PRIMARY KEY,
  lucca_id TEXT,
  nom TEXT NOT NULL,
  prenom TEXT,
  email TEXT,
  departement TEXT,
  etablissement TEXT,
  poste TEXT,
  numero_employe TEXT,
  date_debut_contrat TEXT,
  date_fin_contrat TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE collaborateurs_lucca ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collaborateurs_lucca_all" ON collaborateurs_lucca FOR ALL USING (true) WITH CHECK (true);
