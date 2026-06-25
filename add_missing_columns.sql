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

-- ═══ Comptes clés "++" par agence (clients très importants avec spécificités) ═══
-- JSONB par agence, ex: {"SA85": true, "GPH85": true}. Coché manuellement dans la fiche.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS categorie_compte_plus JSONB;

-- ═══ Statut client : autoriser "prospect" (en plus de actif/dormant/nouveau) ═══
-- Le calcul des statuts produit aussi "prospect" ; l'ancienne contrainte le rejetait (erreur 400).
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE clients ADD CONSTRAINT clients_status_check CHECK (status IS NULL OR status IN ('actif','dormant','nouveau','prospect'));

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
-- Lien d'un compte-rendu vers une affaire (optionnel)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS affaire_id TEXT;
CREATE INDEX IF NOT EXISTS idx_reports_affaire_id ON reports(affaire_id) WHERE affaire_id IS NOT NULL;

-- ═══ Tâches commerciales (liées clients/affaires, assignées entre collaborateurs) ═══
CREATE TABLE IF NOT EXISTS taches_commerciales (
  id BIGSERIAL PRIMARY KEY,
  titre TEXT NOT NULL,
  description TEXT,
  priorite TEXT DEFAULT 'normale',   -- basse | normale | haute
  statut TEXT DEFAULT 'a_faire',     -- a_faire | en_cours | terminee | annulee
  echeance TIMESTAMPTZ,
  client_id TEXT,
  client_name TEXT,
  affaire_id TEXT,
  affaire_nom TEXT,
  createur_id TEXT, createur_nom TEXT, createur_email TEXT,
  assigne_id TEXT, assigne_nom TEXT, assigne_email TEXT,
  todo_task_id TEXT,                 -- id de la tâche Microsoft To Do créée chez l'assigné
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  done_at TIMESTAMPTZ
);
ALTER TABLE taches_commerciales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "taches_all" ON taches_commerciales;
CREATE POLICY "taches_all" ON taches_commerciales FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_taches_assigne ON taches_commerciales(assigne_email);
CREATE INDEX IF NOT EXISTS idx_taches_client ON taches_commerciales(client_id);
CREATE INDEX IF NOT EXISTS idx_taches_affaire ON taches_commerciales(affaire_id);
CREATE INDEX IF NOT EXISTS idx_taches_statut ON taches_commerciales(statut);

-- ═══ Opportunités (reprises depuis Akuiteo CRM) ═══
CREATE TABLE IF NOT EXISTS opportunites (
  id BIGSERIAL PRIMARY KEY,
  akuiteo_id TEXT UNIQUE,
  code TEXT,
  nom TEXT,
  client_id TEXT, client_name TEXT, customer_akuiteo_id TEXT,
  contact_id TEXT, contact_name TEXT, contact_akuiteo_id TEXT,
  montant NUMERIC, devise TEXT,
  probabilite NUMERIC,
  statut TEXT,                 -- IN_PROGRESS / WON / LOST / DISCARD / ARCHIVED
  stage TEXT, stage_id TEXT,   -- Stade
  pipe TEXT, pipe_id TEXT,     -- Portefeuille
  type_origine TEXT,           -- Type d'origine (résolu via /crm/origin-types)
  origine TEXT, type_opp TEXT,
  description TEXT,
  responsable TEXT, responsable_id TEXT,
  date_signature DATE,
  date_creation TIMESTAMPTZ,
  raw JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- Colonnes ajoutées après coup (si la table existait déjà)
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS type_origine TEXT;
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS contact_id TEXT;
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS contact_akuiteo_id TEXT;
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS montant_travaux NUMERIC;  -- donnée perso Akuiteo "Montant de travaux" (1-number01)
ALTER TABLE opportunites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "opportunites_all" ON opportunites;
CREATE POLICY "opportunites_all" ON opportunites FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_opp_statut ON opportunites(statut);
CREATE INDEX IF NOT EXISTS idx_opp_client ON opportunites(client_id);
CREATE INDEX IF NOT EXISTS idx_opp_stage ON opportunites(stage);

-- Lien tâche commerciale → opportunité
ALTER TABLE taches_commerciales ADD COLUMN IF NOT EXISTS opportunite_id TEXT;
ALTER TABLE taches_commerciales ADD COLUMN IF NOT EXISTS opportunite_nom TEXT;
-- Rappel automatique par email à l'échéance (cron Vercel /api/taches-rappels)
ALTER TABLE taches_commerciales ADD COLUMN IF NOT EXISTS rappel_envoye BOOLEAN DEFAULT FALSE;
ALTER TABLE taches_commerciales ADD COLUMN IF NOT EXISTS rappel_date TIMESTAMPTZ;

-- Lien compte-rendu → opportunité
ALTER TABLE reports ADD COLUMN IF NOT EXISTS opportunite_id TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS opportunite_nom TEXT;
CREATE INDEX IF NOT EXISTS idx_reports_opportunite ON reports(opportunite_id);

-- ═══ Journal de connexions au CRM ═══
-- Une ligne par connexion réussie (qui s'est identifié et quand).
CREATE TABLE IF NOT EXISTS connexions_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  nom TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE connexions_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "connexions_log_all" ON connexions_log;
CREATE POLICY "connexions_log_all" ON connexions_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_connexions_log_created ON connexions_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_legacy_id ON clients(legacy_id);
CREATE INDEX IF NOT EXISTS idx_contacts_legacy_id ON contacts(legacy_id);
CREATE INDEX IF NOT EXISTS idx_reports_legacy_id ON reports(legacy_id);

-- ═══════════════════════════════════════════════════════════
--  RECHERCHE TOLÉRANTE (assistant IA NOVA) — indexation trigram
--  Permet de retrouver une société malgré ponctuation/espaces/casse/fautes
--  Ex : "6K" trouve "6.K ARCHI", "LT ARCHI" trouve l'entrée même mal saisie.
-- ═══════════════════════════════════════════════════════════
-- pg_trgm peut être installé dans "public" ou "extensions" selon le projet.
-- On installe si absent et on élargit le search_path (session + fonctions) pour que
-- gin_trgm_ops et similarity() soient résolus quel que soit leur schéma.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SET search_path = public, extensions;

-- Index trigram sur le nom NORMALISÉ (alphanumérique seul, minuscules) → tolérant à la ponctuation et aux espaces
CREATE INDEX IF NOT EXISTS idx_clients_name_norm_trgm
  ON clients USING gin (regexp_replace(lower(name), '[^a-z0-9]', '', 'g') gin_trgm_ops);
-- Index trigram sur le nom brut → similarité / tolérance aux fautes de frappe
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm
  ON clients USING gin (lower(name) gin_trgm_ops);
-- Idem pour les contacts (recherche par nom)
CREATE INDEX IF NOT EXISTS idx_contacts_nom_trgm
  ON contacts USING gin (lower(nom) gin_trgm_ops);

-- Fonction de recherche tolérante de clients/prospects, classée par pertinence
CREATE OR REPLACE FUNCTION search_clients(q text, lim int DEFAULT 20)
RETURNS TABLE (
  id text, name text, code text, city text, code_postal text,
  status text, account_manager_name text, salesman_name text, siren text, score real
)
LANGUAGE sql STABLE
SET search_path = public, extensions, pg_catalog
AS $$
  WITH qn AS (
    SELECT regexp_replace(lower(coalesce(q,'')), '[^a-z0-9]', '', 'g') AS qq,
           lower(coalesce(q,'')) AS ql
  )
  SELECT c.id::text, c.name::text, c.code::text, c.city::text, c.code_postal::text,
         c.status::text, c.account_manager_name::text, c.salesman_name::text, c.siren::text,
         GREATEST(
           similarity(lower(c.name), qn.ql),
           CASE
             WHEN qn.qq <> '' AND regexp_replace(lower(c.name), '[^a-z0-9]', '', 'g') = qn.qq THEN 1.0
             WHEN qn.qq <> '' AND regexp_replace(lower(c.name), '[^a-z0-9]', '', 'g') LIKE qn.qq || '%' THEN 0.95
             WHEN qn.qq <> '' AND regexp_replace(lower(c.name), '[^a-z0-9]', '', 'g') LIKE '%' || qn.qq || '%' THEN 0.9
             ELSE 0
           END
         )::real AS score
  FROM clients c, qn
  WHERE (qn.qq <> '' AND regexp_replace(lower(c.name), '[^a-z0-9]', '', 'g') LIKE '%' || qn.qq || '%')
     OR similarity(lower(c.name), qn.ql) > 0.25
  ORDER BY score DESC, c.name
  LIMIT LEAST(COALESCE(lim, 20), 50);
$$;
GRANT EXECUTE ON FUNCTION search_clients(text, int) TO anon, authenticated, service_role;

-- Index trigram sur le nom complet du contact (nom + prénom) normalisé
CREATE INDEX IF NOT EXISTS idx_contacts_fullnorm_trgm
  ON contacts USING gin (regexp_replace(lower(coalesce(nom,'') || coalesce(prenom,'')), '[^a-z0-9]', '', 'g') gin_trgm_ops);

-- Fonction de recherche tolérante de contacts, classée par pertinence
CREATE OR REPLACE FUNCTION search_contacts(q text, lim int DEFAULT 20)
RETURNS TABLE (
  id text, client_id text, nom text, prenom text, titre text, fonction text, service text,
  email text, email2 text, telephone text, mobile text, score real
)
LANGUAGE sql STABLE
SET search_path = public, extensions, pg_catalog
AS $$
  WITH qn AS (
    SELECT regexp_replace(lower(coalesce(q,'')), '[^a-z0-9]', '', 'g') AS qq,
           lower(coalesce(q,'')) AS ql
  )
  SELECT c.id::text, c.client_id::text, c.nom::text, c.prenom::text, c.titre::text, c.fonction::text, c.service::text,
         c.email::text, c.email2::text, c.telephone::text, c.mobile::text,
         GREATEST(
           similarity(lower(coalesce(c.nom,'') || ' ' || coalesce(c.prenom,'')), qn.ql),
           similarity(lower(coalesce(c.prenom,'') || ' ' || coalesce(c.nom,'')), qn.ql),
           CASE
             WHEN qn.qq <> '' AND regexp_replace(lower(coalesce(c.nom,'') || coalesce(c.prenom,'')), '[^a-z0-9]', '', 'g') LIKE '%' || qn.qq || '%' THEN 0.9
             WHEN qn.qq <> '' AND regexp_replace(lower(coalesce(c.prenom,'') || coalesce(c.nom,'')), '[^a-z0-9]', '', 'g') LIKE '%' || qn.qq || '%' THEN 0.9
             ELSE 0
           END
         )::real AS score
  FROM contacts c, qn
  WHERE (qn.qq <> '' AND (
            regexp_replace(lower(coalesce(c.nom,'') || coalesce(c.prenom,'')), '[^a-z0-9]', '', 'g') LIKE '%' || qn.qq || '%'
         OR regexp_replace(lower(coalesce(c.prenom,'') || coalesce(c.nom,'')), '[^a-z0-9]', '', 'g') LIKE '%' || qn.qq || '%'))
     OR similarity(lower(coalesce(c.nom,'') || ' ' || coalesce(c.prenom,'')), qn.ql) > 0.25
  ORDER BY score DESC, c.nom
  LIMIT LEAST(COALESCE(lim, 20), 50);
$$;
GRANT EXECUTE ON FUNCTION search_contacts(text, int) TO anon, authenticated, service_role;
