-- Migration: Ajout colonne societe (companyCode Akuiteo) sur devis, commandes, factures
-- Pour permettre le filtre par société dans le CRM

ALTER TABLE devis ADD COLUMN IF NOT EXISTS societe TEXT;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS societe TEXT;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS societe TEXT;

-- Apporteur d'affaire (prescripteur) - récupéré depuis projectSubCategory du projet Akuiteo
ALTER TABLE affaires ADD COLUMN IF NOT EXISTS apporteur_affaire TEXT;
ALTER TABLE affaires ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS apporteur_affaire TEXT;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS apporteur_affaire TEXT;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS apporteur_affaire TEXT;

-- Rédacteur des comptes-rendus
ALTER TABLE reports ADD COLUMN IF NOT EXISTS redacteur_id BIGINT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS redacteur_nom TEXT;

-- Index pour filtrage rapide
CREATE INDEX IF NOT EXISTS idx_devis_societe ON devis(societe);
CREATE INDEX IF NOT EXISTS idx_commandes_societe ON commandes(societe);
CREATE INDEX IF NOT EXISTS idx_factures_societe ON factures(societe);
CREATE INDEX IF NOT EXISTS idx_reports_redacteur ON reports(redacteur_id);
