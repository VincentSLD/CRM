-- ════════════════════════════════════════════════════════════════════════
-- Suivi de synchronisation des établissements secondaires (Sites Akuiteo)
-- À exécuter une fois dans Supabase (SQL Editor).
--
-- Un établissement secondaire (est_siege = false) est poussé vers Akuiteo comme
-- "Site" du client siège, et non comme client à part entière : il n'a donc pas
-- d'akuiteo_id. On stocke ici l'identifiant du Site Akuiteo correspondant pour
-- pouvoir afficher le bouton de synchronisation en vert une fois synchronisé.
-- ════════════════════════════════════════════════════════════════════════

alter table public.clients add column if not exists akuiteo_site_id text;
