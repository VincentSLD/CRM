-- ════════════════════════════════════════════════════════════════════════
-- Typologie de prestation des documents (devis / commandes / factures)
-- À exécuter une fois dans Supabase (SQL Editor).
--
-- Ajoute la colonne type_prestation = "Type de mission" Akuiteo
-- (custom_data['1-alpha06'].value), ex. "01_SOL G1 + G2 AVP", "08_EXE RDC SIMPLE".
-- Le métier (Géotechnique = SOL / Structure = EXE) est déduit côté application.
--
-- Les prochaines synchronisations Akuiteo (complètes) renseigneront ce champ
-- automatiquement. Le UPDATE ci-dessous fait un backfill immédiat à partir des
-- custom_data déjà présents en base.
-- ════════════════════════════════════════════════════════════════════════

alter table public.devis     add column if not exists type_prestation text;
alter table public.commandes add column if not exists type_prestation text;
alter table public.factures  add column if not exists type_prestation text;

update public.devis
  set type_prestation = custom_data->'1-alpha06'->>'value'
  where custom_data ? '1-alpha06' and coalesce(type_prestation, '') = '';

update public.commandes
  set type_prestation = custom_data->'1-alpha06'->>'value'
  where custom_data ? '1-alpha06' and coalesce(type_prestation, '') = '';

update public.factures
  set type_prestation = custom_data->'1-alpha06'->>'value'
  where custom_data ? '1-alpha06' and coalesce(type_prestation, '') = '';
