-- ════════════════════════════════════════════════════════════════════════
-- Outil de relance de devis — table de suivi des relances
-- À exécuter une fois dans Supabase (SQL Editor) avant d'utiliser la fonction.
--
-- Stockée séparément de la table `devis` pour ne PAS être écrasée par la
-- synchronisation Akuiteo. Une seule ligne par devis (upsert sur devis_id).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.relances_devis (
  devis_id       text primary key,            -- = devis.id (clé d'upsert)
  devis_ref      text,
  client_id      text,
  client_name    text,
  statut         text not null default 'en_attente',  -- 'en_attente' | 'cloture'
  date_relance   date not null default current_date,
  note           text,
  commercial_id  text,
  commercial_nom text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- RLS : aligner sur le reste du CRM (accès via la clé anon).
-- Si vos autres tables (reports, clients...) utilisent des policies plus
-- restrictives, reproduisez-les ici à l'identique.
alter table public.relances_devis enable row level security;

drop policy if exists "relances_devis_all" on public.relances_devis;
create policy "relances_devis_all" on public.relances_devis
  for all using (true) with check (true);
