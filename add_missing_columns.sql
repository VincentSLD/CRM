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
-- Code SITE Akuiteo (siteCode « SCLI… » de l'établissement) : généré par Akuiteo, récupéré à la synchro
ALTER TABLE clients ADD COLUMN IF NOT EXISTS code_site TEXT;
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
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS honoraires_agences JSONB; -- CRM-only : décomposition par agence [{agence,montant,stade,statut}] — stade/statut par agence, statut global déduit (non synchronisé Akuiteo)
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS typologie TEXT;           -- CRM-only : typologie de l'opportunité
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS sous_typologie TEXT;      -- CRM-only : sous-typologie de l'opportunité
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS chantier_lat NUMERIC;     -- CRM-only : latitude du chantier (point placé sur la carte)
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS chantier_lng NUMERIC;     -- CRM-only : longitude du chantier
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS chantier_adresse TEXT;    -- CRM-only : adresse/repère du chantier (optionnel)
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS chantier_dept TEXT;       -- CRM-only : numéro de département du chantier (01-95, 2A/2B, DOM, « Autres »)
ALTER TABLE opportunites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "opportunites_all" ON opportunites;
CREATE POLICY "opportunites_all" ON opportunites FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_opp_statut ON opportunites(statut);
CREATE INDEX IF NOT EXISTS idx_opp_client ON opportunites(client_id);
CREATE INDEX IF NOT EXISTS idx_opp_stage ON opportunites(stage);

-- Zones d'opportunité tracées sur la Carte des opportunités (polygones + titre/commentaire/couleur)
CREATE TABLE IF NOT EXISTS carte_zones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titre TEXT,
  commentaire TEXT,
  couleur TEXT,
  opacite NUMERIC,
  geojson JSONB,          -- géométrie du polygone (GeoJSON Feature, coordonnées lon/lat WGS84)
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE carte_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "carte_zones_all" ON carte_zones;
CREATE POLICY "carte_zones_all" ON carte_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);

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
  app TEXT,   -- outil source : 'CRM', 'geocarto', 'geoplan', 'geoter'… (base Supabase partagée)
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE connexions_log ADD COLUMN IF NOT EXISTS app TEXT;
ALTER TABLE connexions_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "connexions_log_all" ON connexions_log;
CREATE POLICY "connexions_log_all" ON connexions_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_connexions_log_created ON connexions_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connexions_log_app ON connexions_log(app);

-- ═══ Newsletter hebdomadaire (IA) ═══
-- Préférences d'abonnement par collaborateur (espace perso, clic sur l'avatar).
CREATE TABLE IF NOT EXISTS newsletter_prefs (
  user_id TEXT PRIMARY KEY,            -- id du collaborateur (ou email à défaut)
  email TEXT,
  nom TEXT,
  abonne BOOLEAN DEFAULT FALSE,
  ton TEXT DEFAULT 'convivial',        -- convivial | pro | fun
  agences TEXT[],                      -- agences suivies (vide = toutes)
  sections JSONB,                      -- sections activées {analyses,topClients,opportunites,marches,nouveaux,dormants,concurrents,conjoncture,fetes,podium,perso}
  date_naissance DATE,                 -- pour les anniversaires (optionnel)
  brief_perso BOOLEAN DEFAULT FALSE,   -- abonnement au brief commercial personnalisé (2e email)
  manager_id TEXT,                     -- akuiteo_manager_id du collaborateur (pour filtrer son périmètre côté cron)
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE newsletter_prefs ADD COLUMN IF NOT EXISTS brief_perso BOOLEAN DEFAULT FALSE;
ALTER TABLE newsletter_prefs ADD COLUMN IF NOT EXISTS manager_id TEXT;
ALTER TABLE newsletter_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "newsletter_prefs_all" ON newsletter_prefs;
CREATE POLICY "newsletter_prefs_all" ON newsletter_prefs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Archive des éditions générées (consultables in-app + lien « voir dans le navigateur »).
CREATE TABLE IF NOT EXISTS newsletters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titre TEXT,
  periode_debut DATE,
  periode_fin DATE,
  html TEXT,                           -- corps HTML de l'édition
  data JSONB,                          -- données agrégées ayant servi à la génération
  cree_par TEXT,
  envoye_a INT DEFAULT 0,              -- nombre de destinataires
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "newsletters_all" ON newsletters;
CREATE POLICY "newsletters_all" ON newsletters FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_newsletters_created ON newsletters(created_at DESC);
-- Texte brut de la veille web de l'édition (puces par rubrique) → sert à ne pas répéter les mêmes infos d'une infolettre à l'autre
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS veille TEXT;

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

-- ============================================================================
-- INDEX DE PERFORMANCE (remède aux timeouts 522 au chargement)
-- Sans ces index, chaque login trie des tables entières (order by date desc
-- sur ~26 000 lignes) → Postgres met 25 s → Cloudflare coupe à 522.
-- À exécuter une fois. CONCURRENTLY = pas de verrou (à lancer hors transaction).
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_devis_date        ON devis (date DESC);
CREATE INDEX IF NOT EXISTS idx_commandes_date     ON commandes (date DESC);
CREATE INDEX IF NOT EXISTS idx_factures_date      ON factures (date DESC);
CREATE INDEX IF NOT EXISTS idx_marches_date_debut ON marches (date_debut DESC);
CREATE INDEX IF NOT EXISTS idx_affaires_date_debut ON affaires (date_debut DESC);
CREATE INDEX IF NOT EXISTS idx_reports_date       ON reports (date DESC);
CREATE INDEX IF NOT EXISTS idx_clients_name       ON clients (name);
CREATE INDEX IF NOT EXISTS idx_clients_acct_mgr   ON clients (account_manager_id);

-- Clés étrangères fréquemment filtrées (jointures/agrégations par client)
CREATE INDEX IF NOT EXISTS idx_devis_client_id    ON devis (client_id);
CREATE INDEX IF NOT EXISTS idx_commandes_client_id ON commandes (client_id);
CREATE INDEX IF NOT EXISTS idx_factures_client_id ON factures (client_id);
CREATE INDEX IF NOT EXISTS idx_affaires_marche_id ON affaires (marche_id);

ANALYZE devis; ANALYZE commandes; ANALYZE factures; ANALYZE marches; ANALYZE affaires; ANALYZE reports; ANALYZE clients;

-- ═══ Codes compte Akuiteo des documents (données personnalisées) ═══
-- Code AA (1-alpha09) = code compte apporteur d'affaire ; Code GO (1-alpha11) = code compte gros-œuvre.
-- Permettent de résoudre le commercial par code exact (clients.code) plutôt que par nom.
ALTER TABLE devis     ADD COLUMN IF NOT EXISTS apporteur_code  TEXT;
ALTER TABLE devis     ADD COLUMN IF NOT EXISTS gros_oeuvre_code TEXT;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS apporteur_code  TEXT;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS gros_oeuvre_code TEXT;
ALTER TABLE factures  ADD COLUMN IF NOT EXISTS apporteur_code  TEXT;
ALTER TABLE factures  ADD COLUMN IF NOT EXISTS gros_oeuvre_code TEXT;

-- ═══ Sollicitations : lier des comptes clients/prospects à une opportunité + suivi ═══
-- Une opportunité → plusieurs comptes sollicités ; un compte → plusieurs sollicitations.
CREATE TABLE IF NOT EXISTS sollicitations (
  id BIGSERIAL PRIMARY KEY,
  opportunite_id TEXT,
  opportunite_nom TEXT,
  client_id TEXT,
  client_name TEXT,
  statut TEXT DEFAULT 'a_solliciter',   -- a_solliciter | sollicite | interesse | sans_suite | converti
  commentaire TEXT,
  createur_id TEXT, createur_nom TEXT, createur_email TEXT,
  date_sollicitation TIMESTAMPTZ,
  date_relance TIMESTAMPTZ,
  email_envoye BOOLEAN DEFAULT FALSE,
  email_date TIMESTAMPTZ,
  email_objet TEXT,
  email_destinataire TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE sollicitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sollicitations_all" ON sollicitations;
CREATE POLICY "sollicitations_all" ON sollicitations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_sollic_opportunite ON sollicitations(opportunite_id);
CREATE INDEX IF NOT EXISTS idx_sollic_client ON sollicitations(client_id);
CREATE INDEX IF NOT EXISTS idx_sollic_statut ON sollicitations(statut);
-- Assigné (défaut = responsable de l'opportunité) + rappel email automatique à la date « À faire avant »
ALTER TABLE sollicitations ADD COLUMN IF NOT EXISTS assigne_id TEXT;
ALTER TABLE sollicitations ADD COLUMN IF NOT EXISTS assigne_nom TEXT;
ALTER TABLE sollicitations ADD COLUMN IF NOT EXISTS assigne_email TEXT;
ALTER TABLE sollicitations ADD COLUMN IF NOT EXISTS rappel_envoye BOOLEAN DEFAULT FALSE;
ALTER TABLE sollicitations ADD COLUMN IF NOT EXISTS rappel_date TIMESTAMPTZ;
ALTER TABLE sollicitations ADD COLUMN IF NOT EXISTS todo_task_id TEXT;  -- id de la tâche Microsoft To Do (visible dans Outlook)
-- Contact interlocuteur de la société sollicitée (destinataire par défaut du mail)
ALTER TABLE sollicitations ADD COLUMN IF NOT EXISTS contact_id TEXT;
ALTER TABLE sollicitations ADD COLUMN IF NOT EXISTS contact_nom TEXT;
ALTER TABLE sollicitations ADD COLUMN IF NOT EXISTS contact_email TEXT;
CREATE INDEX IF NOT EXISTS idx_sollic_assigne ON sollicitations(assigne_email);

-- ═══ Géolocalisation des marchés (point placé sur la carte ; synchro données perso Akuiteo Latitude/Longitude) ═══
ALTER TABLE marches ADD COLUMN IF NOT EXISTS lat NUMERIC;
ALTER TABLE marches ADD COLUMN IF NOT EXISTS lng NUMERIC;

-- ═══ Retirer les clés étrangères marche_id / affaire_id (l'app fait ses jointures côté client) ═══
-- Ces FK bloquaient la synchro complète (documents upsertés avant les marchés / changement d'ID marché).
-- Les liens restent assurés par la cohérence des ID (_marcheOf) ; on garde des index simples pour la perf.
ALTER TABLE devis     DROP CONSTRAINT IF EXISTS devis_marche_id_fkey;
ALTER TABLE devis     DROP CONSTRAINT IF EXISTS devis_affaire_id_fkey;
ALTER TABLE commandes DROP CONSTRAINT IF EXISTS commandes_marche_id_fkey;
ALTER TABLE commandes DROP CONSTRAINT IF EXISTS commandes_affaire_id_fkey;
ALTER TABLE factures  DROP CONSTRAINT IF EXISTS factures_marche_id_fkey;
ALTER TABLE factures  DROP CONSTRAINT IF EXISTS factures_affaire_id_fkey;
ALTER TABLE affaires  DROP CONSTRAINT IF EXISTS affaires_marche_id_fkey;
CREATE INDEX IF NOT EXISTS idx_devis_marche_id     ON devis (marche_id);
CREATE INDEX IF NOT EXISTS idx_commandes_marche_id ON commandes (marche_id);
CREATE INDEX IF NOT EXISTS idx_factures_marche_id  ON factures (marche_id);
CREATE INDEX IF NOT EXISTS idx_affaires_marche_id2 ON affaires (marche_id);

-- Point GPS marché validé manuellement (certifié conforme)
ALTER TABLE marches ADD COLUMN IF NOT EXISTS gps_certifie BOOLEAN DEFAULT FALSE;

-- ═══ Listes de diffusion par agence (email auto à la création d'opportunité) ═══
-- 1 agence = plusieurs emails ; à la création d'une opportunité, un mail part vers les agences cochées.
CREATE TABLE IF NOT EXISTS listes_diffusion (
  agence TEXT PRIMARY KEY,
  emails TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE listes_diffusion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "listes_diffusion_all" ON listes_diffusion;
CREATE POLICY "listes_diffusion_all" ON listes_diffusion FOR ALL TO authenticated USING (true) WITH CHECK (true);
