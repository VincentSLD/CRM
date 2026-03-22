-- Table de configuration partagée du CRM
-- Stocke les paramètres (mot de passe de suppression, etc.)

CREATE TABLE IF NOT EXISTS crm_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permettre l'accès anonyme (même politique que les autres tables)
ALTER TABLE crm_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_config_all" ON crm_config FOR ALL USING (true) WITH CHECK (true);

-- Valeur par défaut
INSERT INTO crm_config (key, value) VALUES ('delete_password', '') ON CONFLICT (key) DO NOTHING;
