-- Ajout des colonnes manquantes dans la table clients
-- À exécuter dans Supabase SQL Editor

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
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mode_tarification_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mode_tarification_2_name TEXT;
