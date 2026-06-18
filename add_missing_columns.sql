-- Ajout des colonnes manquantes + tables manquantes
-- À exécuter dans Supabase SQL Editor

-- Table groupes de diffusion
CREATE TABLE IF NOT EXISTS groupes_diffusion (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  membres JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE groupes_diffusion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "groupes_diffusion_all" ON groupes_diffusion;
CREATE POLICY "groupes_diffusion_all" ON groupes_diffusion FOR ALL USING (true) WITH CHECK (true);

-- Colonnes manquantes table clients

ALTER TABLE clients ADD COLUMN IF NOT EXISTS categorie TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS profession TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS secteur_activite TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS langue TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mots_cles TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS statut_akuiteo TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS code_societe TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS condition_paiement TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mode_paiement TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tva_intracommunautaire TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS habitudes_techniques TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS habitudes_geotechniques TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mode_tarification TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mode_tarification_2 TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS salesman_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_manager_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS salesman_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS commerciaux_associes TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mode_tarification_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mode_tarification_2_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS akuiteo_dirty BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mk_categorie TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mk_categorie_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mk_sous_categorie TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mk_sous_categorie_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mk_categorie_pro TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mk_categorie_pro_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mk_secteur TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mk_secteur_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mk_type TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mk_type_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mk_groupe TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mk_origine TEXT;

-- Surface facturée sur les commandes (somme des quantity des lignes)
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS surface_facturee NUMERIC;

-- Champs contacts complets (alignés sur Akuiteo)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email2 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS code_postal TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS commentaire TEXT;

-- ═══ Objectifs et mapping métier ═══

-- Mapping Type de Mission → Métier (SOL / EXE)
CREATE TABLE IF NOT EXISTS mission_metier_mapping (
  type_mission TEXT PRIMARY KEY,
  metier TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE mission_metier_mapping ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mission_metier_all" ON mission_metier_mapping;
CREATE POLICY "mission_metier_all" ON mission_metier_mapping FOR ALL USING (true) WITH CHECK (true);

-- Objectifs annuels par agence + métier
CREATE TABLE IF NOT EXISTS objectifs_agences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agence TEXT NOT NULL,
  metier TEXT NOT NULL,
  annee INT NOT NULL,
  objectif_ht NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agence, metier, annee)
);
ALTER TABLE objectifs_agences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "objectifs_agences_all" ON objectifs_agences;
CREATE POLICY "objectifs_agences_all" ON objectifs_agences FOR ALL USING (true) WITH CHECK (true);

-- Objectifs annuels par client + agence + métier
CREATE TABLE IF NOT EXISTS objectifs_clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id TEXT NOT NULL,
  agence TEXT NOT NULL,
  metier TEXT NOT NULL,
  annee INT NOT NULL,
  objectif_ht NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, agence, metier, annee)
);
ALTER TABLE objectifs_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "objectifs_clients_all" ON objectifs_clients;
CREATE POLICY "objectifs_clients_all" ON objectifs_clients FOR ALL USING (true) WITH CHECK (true);

-- ═══ Concurrence ═══
CREATE TABLE IF NOT EXISTS concurrents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  raison_sociale TEXT,
  siren TEXT,
  siret TEXT,
  ape TEXT,
  ville TEXT,
  code_postal TEXT,
  departement TEXT,
  region TEXT,
  site_web TEXT,
  metiers TEXT[],
  notes TEXT,
  couleur TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE concurrents ADD COLUMN IF NOT EXISTS agences TEXT[];
ALTER TABLE concurrents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "concurrents_all" ON concurrents;
CREATE POLICY "concurrents_all" ON concurrents FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_concurrents_nom ON concurrents(nom);
CREATE INDEX IF NOT EXISTS idx_concurrents_siren ON concurrents(siren);

CREATE TABLE IF NOT EXISTS client_concurrents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id TEXT NOT NULL,
  concurrent_id UUID NOT NULL REFERENCES concurrents(id) ON DELETE CASCADE,
  metiers TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, concurrent_id)
);
ALTER TABLE client_concurrents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_concurrents_all" ON client_concurrents;
CREATE POLICY "client_concurrents_all" ON client_concurrents FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_client_concurrents_client ON client_concurrents(client_id);
CREATE INDEX IF NOT EXISTS idx_client_concurrents_concurrent ON client_concurrents(concurrent_id);

-- ═══ Procédures collectives (BODACC) + état INSEE ═══
ALTER TABLE clients ADD COLUMN IF NOT EXISTS procedure_collective    TEXT;     -- type court (RJ, LJ, Sauvegarde, Plan, ...)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS procedure_nature        TEXT;     -- libellé exact BODACC (jugement.nature)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS procedure_date          DATE;     -- date du jugement
ALTER TABLE clients ADD COLUMN IF NOT EXISTS procedure_url           TEXT;     -- lien BODACC
ALTER TABLE clients ADD COLUMN IF NOT EXISTS procedure_checked_at    TIMESTAMPTZ; -- horodatage du dernier check
ALTER TABLE clients ADD COLUMN IF NOT EXISTS etat_insee              TEXT;     -- 'A' = Active, 'C' = Cessée/Radiée
ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_fermeture_insee    DATE;     -- date de cessation INSEE
CREATE INDEX IF NOT EXISTS idx_clients_procedure_collective ON clients(procedure_collective) WHERE procedure_collective IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_etat_insee ON clients(etat_insee) WHERE etat_insee = 'C';

-- ═══ Rang ABC par agence (classement CA décroissant, 1 = plus gros) ═══
-- JSONB par agence, ex: {"SA85": 12, "GPH85": 3}. Renseigné par la catégorisation ABC.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS categorie_compte_rang JSONB;

-- ═══ Catégorisation ABC par RÔLE (CA facturé attribué au rôle, par agence) ═══
-- Mêmes valeurs que categorie_compte ("A- Stratégique"/"B- Tactique"/"C- Listé"), JSONB par agence,
-- + rang par agence. Renseignées par la catégorisation ABC (rôles apporteur/architecte/gros-œuvre).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS categorie_apporteur        JSONB;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS categorie_apporteur_rang   JSONB;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS categorie_architecte       JSONB;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS categorie_architecte_rang  JSONB;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS categorie_gros_oeuvre      JSONB;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS categorie_gros_oeuvre_rang JSONB;

-- ═══ Campagnes marketing (ciblage emails) ═══
CREATE TABLE IF NOT EXISTS campagnes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  description TEXT,
  criteria JSONB DEFAULT '{}'::jsonb,
  emails JSONB DEFAULT '[]'::jsonb,
  emails_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE campagnes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campagnes_all" ON campagnes;
CREATE POLICY "campagnes_all" ON campagnes FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_campagnes_updated_at ON campagnes(updated_at DESC);

-- ═══ Import XML (CODIAL legacy) — colonnes pour traçabilité et matching ═══
ALTER TABLE clients ADD COLUMN IF NOT EXISTS legacy_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS code_codial TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS legacy_id TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS legacy_id TEXT;
CREATE INDEX IF NOT EXISTS idx_clients_legacy_id ON clients(legacy_id);
CREATE INDEX IF NOT EXISTS idx_contacts_legacy_id ON contacts(legacy_id);
CREATE INDEX IF NOT EXISTS idx_reports_legacy_id ON reports(legacy_id);
