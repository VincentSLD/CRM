# Assistant documentaire permanent (GED) — mise en place

Outil accessible dans **Paramétrage → En Dev' → Assistant documentaire**.
Indexe le texte de documents (≈1000 PDF) dans Supabase avec recherche sémantique
(RAG par embeddings OpenAI), interrogeable à tout moment.

## 1. Supabase — base de données (une fois)

Exécuter **`docs/ged.sql`** dans le SQL Editor. Cela :
- active l'extension `vector` (pgvector) ;
- crée les tables `ged_documents` et `ged_chunks` (texte + embeddings 1536 dim.) ;
- crée la fonction de recherche `ged_match` ;
- pose les politiques RLS (accès réservé aux utilisateurs authentifiés).

## 2. Vercel — variables d'environnement

- `OPENAI_API_KEY` — pour générer les embeddings (`text-embedding-3-small`),
  utilisé à l'indexation (`/api/embed`) et à l'interrogation (`/api/ged-ask`).
- `ANTHROPIC_API_KEY` — déjà présent (réponse de Claude).
- `SUPABASE_SERVICE_ROLE_KEY` — recommandé pour `/api/ged-ask` (sinon repli sur la clé anon).

Penser à **redéployer** après ajout des variables.

## 3. Utilisation

1. **Indexer** : bouton « Indexer / mettre à jour un dossier » → choisir le dossier
   réseau (le navigateur demande l'autorisation). Les PDF/DOCX/TXT/CSV/EML sont lus,
   découpés en passages, vectorisés et stockés. Une barre de progression suit l'avancement.
   - Les fichiers déjà indexés et **inchangés** sont ignorés (détection par taille + date).
   - Un fichier **modifié** est ré-indexé (l'ancienne version est remplacée).
2. **Interroger** : poser une question en langage naturel. L'assistant retrouve les
   passages les plus pertinents parmi tous les documents et répond avec ses sources
   et un niveau de confiance.

## Notes

- Seul le **texte** est stocké, pas les fichiers PDF originaux (le chemin réseau est conservé).
- L'indexation est une **action manuelle** : un serveur Vercel ne peut pas accéder
  au lecteur réseau interne, c'est le navigateur (via l'autorisation de dossier) qui lit les fichiers.
- Coût d'indexation des embeddings : très faible (quelques centimes pour ~1000 documents).
- Compatible Chrome / Edge (API File System Access). Firefox/Safari ne supportent pas le choix de dossier.
