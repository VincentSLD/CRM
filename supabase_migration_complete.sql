-- ============================================
-- MIGRATION COMPLETE : toutes les colonnes manquantes
-- Exécuter dans Supabase SQL Editor
-- ============================================

-- =====================
-- TABLE REPORTS
-- =====================
ALTER TABLE reports ADD COLUMN IF NOT EXISTS contact_id TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS contact_name TEXT;
-- Rendre client_name nullable (pas toujours renseigné)
ALTER TABLE reports ALTER COLUMN client_name DROP NOT NULL;

-- =====================
-- TABLE CLIENTS (champs Akuiteo)
-- =====================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS adresse_ligne1 TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS adresse_ligne2 TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS adresse_ligne3 TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS code_postal TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pays TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS departement TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS telephone2 TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS fax TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS site_web TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS raison_sociale TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS raison_sociale2 TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS siren TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS siret TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ape TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS chiffre_affaires NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS capital NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS effectif NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS categorie TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS profession TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS secteur_activite TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS condition_paiement TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mode_paiement TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS reference_externe TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS forme_juridique TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS statut_akuiteo TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS langue TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mots_cles TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS code_societe TEXT;

-- =====================
-- TABLE DEVIS (champs Akuiteo)
-- =====================
ALTER TABLE devis DROP CONSTRAINT IF EXISTS devis_pkey CASCADE;
ALTER TABLE devis ALTER COLUMN id SET DATA TYPE TEXT USING id::TEXT;
ALTER TABLE devis ADD PRIMARY KEY (id);
ALTER TABLE devis DROP CONSTRAINT IF EXISTS devis_statut_check;
ALTER TABLE devis ADD CONSTRAINT devis_statut_check
  CHECK (statut IN ('accepted','pending','sent','refused','signed','archived'));
ALTER TABLE devis ALTER COLUMN ref DROP NOT NULL;
ALTER TABLE devis DROP CONSTRAINT IF EXISTS devis_ref_key;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS montant_ttc NUMERIC;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS projet TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS agence TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS responsable_id TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS commercial_id TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS reference1 TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS devise TEXT DEFAULT 'EUR';
ALTER TABLE devis ADD COLUMN IF NOT EXISTS probabilite TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS date_validation DATE;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS date_signature_prevue DATE;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS date_signature_reelle DATE;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS nb_lignes INTEGER DEFAULT 0;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS tva NUMERIC;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS akuiteo_id TEXT;

-- =====================
-- TABLE COMMANDES (champs Akuiteo)
-- =====================
ALTER TABLE commandes DROP CONSTRAINT IF EXISTS commandes_pkey CASCADE;
ALTER TABLE commandes ALTER COLUMN id SET DATA TYPE TEXT USING id::TEXT;
ALTER TABLE commandes ADD PRIMARY KEY (id);
ALTER TABLE commandes DROP CONSTRAINT IF EXISTS commandes_statut_check;
ALTER TABLE commandes ADD CONSTRAINT commandes_statut_check
  CHECK (statut IN ('en_cours','livree','annulee','confirmee','expediee'));
ALTER TABLE commandes ALTER COLUMN ref DROP NOT NULL;
ALTER TABLE commandes DROP CONSTRAINT IF EXISTS commandes_ref_key;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS montant_ttc NUMERIC;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS projet TEXT;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS agence TEXT;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS reference1 TEXT;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS devis_origine TEXT;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS responsable_id TEXT;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS date_client DATE;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS date_validation DATE;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS devise TEXT DEFAULT 'EUR';
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS nb_lignes INTEGER DEFAULT 0;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS tva NUMERIC;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS commercial_id TEXT;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS nom TEXT;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS akuiteo_id TEXT;

-- =====================
-- TABLE FACTURES (champs Akuiteo)
-- =====================
ALTER TABLE factures DROP CONSTRAINT IF EXISTS factures_pkey CASCADE;
ALTER TABLE factures ALTER COLUMN id SET DATA TYPE TEXT USING id::TEXT;
ALTER TABLE factures ADD PRIMARY KEY (id);
ALTER TABLE factures DROP CONSTRAINT IF EXISTS factures_statut_check;
ALTER TABLE factures ADD CONSTRAINT factures_statut_check
  CHECK (statut IN ('payee','attente','retard','envoyee','brouillon'));
ALTER TABLE factures ALTER COLUMN ref DROP NOT NULL;
ALTER TABLE factures DROP CONSTRAINT IF EXISTS factures_ref_key;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS montant_ttc NUMERIC;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS projet TEXT;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS agence TEXT;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS type_facture TEXT;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS reste_a_payer NUMERIC;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS mode_paiement TEXT;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS date_envoi DATE;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS date_paiement DATE;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS date_comptable DATE;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS statut_dematerialisation TEXT;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS responsable_id TEXT;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS devise TEXT DEFAULT 'EUR';
ALTER TABLE factures ADD COLUMN IF NOT EXISTS nb_lignes INTEGER DEFAULT 0;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS tva NUMERIC;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS reference1 TEXT;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS akuiteo_id TEXT;

-- =====================
-- RLS policies
-- =====================
ALTER TABLE devis ENABLE ROW LEVEL SECURITY;
ALTER TABLE commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='devis' AND policyname='devis_all') THEN
    EXECUTE 'CREATE POLICY devis_all ON devis FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='commandes' AND policyname='commandes_all') THEN
    EXECUTE 'CREATE POLICY commandes_all ON commandes FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='factures' AND policyname='factures_all') THEN
    EXECUTE 'CREATE POLICY factures_all ON factures FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- =====================
-- Vérification
-- =====================
SELECT 'OK - Migration complete' AS status;
