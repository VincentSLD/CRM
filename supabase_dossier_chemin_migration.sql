-- Migration : Ajouter le champ dossier_chemin aux commandes
-- Permet de stocker le chemin du dossier réseau associé à chaque commande
-- Exécuter dans le SQL Editor du dashboard Supabase

ALTER TABLE commandes ADD COLUMN IF NOT EXISTS dossier_chemin TEXT;

COMMENT ON COLUMN commandes.dossier_chemin IS 'Chemin du dossier réseau Windows associé à la commande (ex: \\SERVEUR\Projets\CMD-2024-041)';
