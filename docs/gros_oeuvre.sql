-- ════════════════════════════════════════════════════════════════════════
-- Gros-œuvre des documents (devis / commandes / factures)
-- À exécuter une fois dans Supabase (SQL Editor).
--
-- Ajoute la colonne gros_oeuvre = custom_data['1-alpha12'].value ("Gros Oeuvre"
-- dans Akuiteo). Utilisée comme type de nœud dans la cartographie "qui travaille
-- avec qui" (Analyse / KPI). NB : ce champ est aujourd'hui rarement renseigné
-- dans Akuiteo — la dimension se remplira au fur et à mesure de la saisie.
--
-- Les prochaines synchronisations Akuiteo (complètes) renseigneront ce champ
-- automatiquement. Le UPDATE ci-dessous fait un backfill immédiat à partir des
-- custom_data déjà présents en base.
-- ════════════════════════════════════════════════════════════════════════

alter table public.devis     add column if not exists gros_oeuvre text;
alter table public.commandes add column if not exists gros_oeuvre text;
alter table public.factures  add column if not exists gros_oeuvre text;

update public.devis
  set gros_oeuvre = custom_data->'1-alpha12'->>'value'
  where custom_data ? '1-alpha12' and coalesce(gros_oeuvre, '') = '';

update public.commandes
  set gros_oeuvre = custom_data->'1-alpha12'->>'value'
  where custom_data ? '1-alpha12' and coalesce(gros_oeuvre, '') = '';

update public.factures
  set gros_oeuvre = custom_data->'1-alpha12'->>'value'
  where custom_data ? '1-alpha12' and coalesce(gros_oeuvre, '') = '';
