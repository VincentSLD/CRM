-- ============================================
-- Migration : ajouter tous les champs Akuiteo manquants
-- à la table clients
-- ============================================

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

-- Vérification
SELECT column_name, data_type
FROM information_schema.columns WHERE table_name='clients'
ORDER BY ordinal_position;
