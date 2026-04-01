-- Ajouter le champ lucca_id à la table collaborateurs (Akuiteo) pour lier avec Lucca
ALTER TABLE collaborateurs ADD COLUMN IF NOT EXISTS lucca_id TEXT;

-- Ajouter le champ lucca_id à la table commerciaux pour lier les utilisateurs CRM avec Lucca
ALTER TABLE commerciaux ADD COLUMN IF NOT EXISTS lucca_id TEXT;
