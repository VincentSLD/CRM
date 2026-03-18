-- ═══════════════════════════════════════════════════════
-- Table crm_access : controle d'acces au CRM
-- A executer dans le SQL Editor de Supabase
-- ═══════════════════════════════════════════════════════

-- 1. Creer la table
CREATE TABLE IF NOT EXISTS crm_access (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Activer RLS
ALTER TABLE crm_access ENABLE ROW LEVEL SECURITY;

-- 3. Policy : les utilisateurs authentifies peuvent lire leur propre acces
DROP POLICY IF EXISTS "Users can read own access" ON crm_access;
CREATE POLICY "Users can read own access" ON crm_access
  FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Policy : les utilisateurs authentifies peuvent inserer leur propre ligne (signup)
DROP POLICY IF EXISTS "Users can insert own access" ON crm_access;
CREATE POLICY "Users can insert own access" ON crm_access
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 5. Approuver l'admin existant
-- UPDATE crm_access SET approved = true WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'vsalaud@be-gph.fr');
