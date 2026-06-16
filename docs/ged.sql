-- ════════════════════════════════════════════════════════════════════════
-- Base documentaire permanente (GED) avec recherche sémantique (RAG)
-- À exécuter une fois dans Supabase (SQL Editor).
--
-- Indexe le TEXTE de documents (PDF, DOCX, TXT…) découpé en passages + un
-- vecteur d'embedding (OpenAI text-embedding-3-small, 1536 dimensions) par
-- passage. À l'interrogation, on retrouve les passages les plus proches de la
-- question (distance cosinus) puis on les transmet à Claude.
--
-- Seul le TEXTE est stocké (pas les fichiers PDF originaux) — on conserve le
-- chemin réseau d'origine pour ouvrir le document.
-- ════════════════════════════════════════════════════════════════════════

-- Extension de recherche vectorielle
create extension if not exists vector;

-- Un document indexé (1 ligne par fichier)
create table if not exists public.ged_documents (
  id          uuid primary key default gen_random_uuid(),
  path        text unique not null,          -- chemin relatif dans le dossier scanné
  name        text,
  ext         text,
  size        bigint,
  char_count  int,
  file_hash   text,                           -- "<taille>-<lastModified>" pour détecter les modifications
  indexed_at  timestamptz default now()
);

-- Les passages (chunks) d'un document avec leur embedding
create table if not exists public.ged_chunks (
  id           bigserial primary key,
  document_id  uuid references public.ged_documents(id) on delete cascade,
  chunk_index  int,
  content      text,
  embedding    vector(1536)
);

-- Index de similarité (cosinus). ivfflat nécessite des données pour être efficace ;
-- on peut le (re)construire après une première indexation massive.
create index if not exists ged_chunks_embedding_idx
  on public.ged_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index if not exists ged_chunks_document_idx on public.ged_chunks(document_id);

-- Recherche des passages les plus proches d'une question
create or replace function public.ged_match(query_embedding vector(1536), match_count int default 8)
returns table (
  document_id uuid,
  name        text,
  path        text,
  content     text,
  chunk_index int,
  similarity  float
)
language sql stable
as $$
  select c.document_id, d.name, d.path, c.content, c.chunk_index,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.ged_chunks c
  join public.ged_documents d on d.id = c.document_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Maintenance : supprime les documents enregistrés sans aucun passage
-- (incohérences éventuelles), pour qu'ils soient repris à la prochaine indexation.
create or replace function public.ged_delete_empty()
returns int
language plpgsql
as $$
declare n int;
begin
  delete from public.ged_documents d
  where not exists (select 1 from public.ged_chunks c where c.document_id = d.id);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- RLS : accès réservé aux utilisateurs authentifiés (l'app utilise une session
-- Supabase après connexion Microsoft). Le endpoint /api/ged-ask utilise la clé
-- service role et n'est pas soumis à la RLS.
alter table public.ged_documents enable row level security;
alter table public.ged_chunks    enable row level security;

drop policy if exists ged_documents_auth on public.ged_documents;
create policy ged_documents_auth on public.ged_documents
  for all to authenticated using (true) with check (true);

drop policy if exists ged_chunks_auth on public.ged_chunks;
create policy ged_chunks_auth on public.ged_chunks
  for all to authenticated using (true) with check (true);
