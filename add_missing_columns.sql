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
CREATE POLICY IF NOT EXISTS "mission_metier_all" ON mission_metier_mapping FOR ALL USING (true) WITH CHECK (true);

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
CREATE POLICY IF NOT EXISTS "objectifs_agences_all" ON objectifs_agences FOR ALL USING (true) WITH CHECK (true);

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
CREATE POLICY IF NOT EXISTS "objectifs_clients_all" ON objectifs_clients FOR ALL USING (true) WITH CHECK (true);
