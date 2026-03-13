-- ============================================
-- Migration : adapter les tables devis, commandes, factures
-- pour la synchronisation Akuiteo
-- ============================================

-- 1. DEVIS : changer id en TEXT, ajuster statut
ALTER TABLE devis DROP CONSTRAINT IF EXISTS devis_pkey CASCADE;
ALTER TABLE devis ALTER COLUMN id SET DATA TYPE TEXT USING id::TEXT;
ALTER TABLE devis ADD PRIMARY KEY (id);
ALTER TABLE devis DROP CONSTRAINT IF EXISTS devis_statut_check;
ALTER TABLE devis ADD CONSTRAINT devis_statut_check
  CHECK (statut IN ('accepted','pending','sent','refused','signed','archived'));
-- Rendre ref nullable (pas toujours renseigné depuis Akuiteo)
ALTER TABLE devis ALTER COLUMN ref DROP NOT NULL;
ALTER TABLE devis DROP CONSTRAINT IF EXISTS devis_ref_key;

-- 2. COMMANDES : changer id en TEXT
ALTER TABLE commandes DROP CONSTRAINT IF EXISTS commandes_pkey CASCADE;
ALTER TABLE commandes ALTER COLUMN id SET DATA TYPE TEXT USING id::TEXT;
ALTER TABLE commandes ADD PRIMARY KEY (id);
ALTER TABLE commandes DROP CONSTRAINT IF EXISTS commandes_statut_check;
ALTER TABLE commandes ADD CONSTRAINT commandes_statut_check
  CHECK (statut IN ('en_cours','livree','annulee','confirmee','expediee'));
ALTER TABLE commandes ALTER COLUMN ref DROP NOT NULL;
ALTER TABLE commandes DROP CONSTRAINT IF EXISTS commandes_ref_key;

-- 3. FACTURES : changer id en TEXT, ajuster statut
ALTER TABLE factures DROP CONSTRAINT IF EXISTS factures_pkey CASCADE;
ALTER TABLE factures ALTER COLUMN id SET DATA TYPE TEXT USING id::TEXT;
ALTER TABLE factures ADD PRIMARY KEY (id);
ALTER TABLE factures DROP CONSTRAINT IF EXISTS factures_statut_check;
ALTER TABLE factures ADD CONSTRAINT factures_statut_check
  CHECK (statut IN ('payee','attente','retard','envoyee','brouillon'));
ALTER TABLE factures ALTER COLUMN ref DROP NOT NULL;
ALTER TABLE factures DROP CONSTRAINT IF EXISTS factures_ref_key;

-- 4. RLS : activer et créer des policies permissives
ALTER TABLE devis ENABLE ROW LEVEL SECURITY;
ALTER TABLE commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;

-- Policies pour lecture/écriture (tous les utilisateurs authentifiés)
DO $$
BEGIN
  -- DEVIS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='devis' AND policyname='devis_all') THEN
    EXECUTE 'CREATE POLICY devis_all ON devis FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  -- COMMANDES
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='commandes' AND policyname='commandes_all') THEN
    EXECUTE 'CREATE POLICY commandes_all ON commandes FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  -- FACTURES
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='factures' AND policyname='factures_all') THEN
    EXECUTE 'CREATE POLICY factures_all ON factures FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Vérification
SELECT 'devis' AS table_name, column_name, data_type
FROM information_schema.columns WHERE table_name='devis' AND column_name='id'
UNION ALL
SELECT 'commandes', column_name, data_type
FROM information_schema.columns WHERE table_name='commandes' AND column_name='id'
UNION ALL
SELECT 'factures', column_name, data_type
FROM information_schema.columns WHERE table_name='factures' AND column_name='id';
