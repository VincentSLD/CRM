-- Ajouter custom_data aux clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS custom_data JSONB;
