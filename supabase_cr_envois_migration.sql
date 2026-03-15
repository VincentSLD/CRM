-- ============================================
-- Migration : CR amélioré + table envois
-- Exécuter dans Supabase SQL Editor
-- ============================================

-- =====================
-- TABLE REPORTS : nouveaux champs
-- =====================
ALTER TABLE reports ADD COLUMN IF NOT EXISTS type_cr TEXT DEFAULT 'reunion';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS statut_cr TEXT DEFAULT 'brouillon';

-- =====================
-- TABLE ENVOIS : historique des envois
-- =====================
CREATE TABLE IF NOT EXISTS envois (
  id SERIAL PRIMARY KEY,
  report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL,
  objet TEXT NOT NULL DEFAULT '',
  message TEXT DEFAULT '',
  destinataires JSONB DEFAULT '[]',
  nb_destinataires INTEGER DEFAULT 0,
  contenu TEXT DEFAULT '',
  date_envoi TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE envois ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='envois' AND policyname='envois_all') THEN
    EXECUTE 'CREATE POLICY envois_all ON envois FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- =====================
-- Vérification
-- =====================
SELECT 'OK - Migration CR & Envois complete' AS status;
