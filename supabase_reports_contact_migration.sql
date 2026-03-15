-- ============================================
-- Migration : ajouter contact_id et contact_name à reports
-- ============================================

ALTER TABLE reports ADD COLUMN IF NOT EXISTS contact_id TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS contact_name TEXT;

-- Vérification
SELECT column_name, data_type
FROM information_schema.columns WHERE table_name='reports'
ORDER BY ordinal_position;
