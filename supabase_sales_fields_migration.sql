-- ============================================
-- Migration : ajouter tous les champs Akuiteo manquants
-- aux tables devis, commandes, factures
-- ============================================

-- =====================
-- 1. TABLE DEVIS
-- =====================
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
-- 2. TABLE COMMANDES
-- =====================
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
-- 3. TABLE FACTURES
-- =====================
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
-- 4. Vérification
-- =====================
SELECT 'devis' AS tbl, column_name, data_type
FROM information_schema.columns WHERE table_name='devis'
ORDER BY ordinal_position;

SELECT 'commandes' AS tbl, column_name, data_type
FROM information_schema.columns WHERE table_name='commandes'
ORDER BY ordinal_position;

SELECT 'factures' AS tbl, column_name, data_type
FROM information_schema.columns WHERE table_name='factures'
ORDER BY ordinal_position;
