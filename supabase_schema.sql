-- ================================================
-- CRM Akuiteo — Schema Supabase
-- Exécuter dans : Supabase > SQL Editor > New Query
-- ================================================

-- 1. CLIENTS
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  ca NUMERIC DEFAULT 0,
  obj NUMERIC DEFAULT 0,
  margin NUMERIC DEFAULT 0,
  dso INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  color TEXT DEFAULT '#1a1a1a,#333333',
  ini TEXT DEFAULT '',
  sector TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  status TEXT DEFAULT 'objectif' CHECK (status IN ('advance','objectif','retard')),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  city TEXT DEFAULT '',
  sentiment_pos INTEGER DEFAULT 50,
  sentiment_neu INTEGER DEFAULT 30,
  sentiment_neg INTEGER DEFAULT 20,
  last_contact TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. DEVIS
CREATE TABLE devis (
  id SERIAL PRIMARY KEY,
  ref TEXT UNIQUE NOT NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  montant NUMERIC DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  statut TEXT DEFAULT 'pending' CHECK (statut IN ('accepted','pending','sent','refused')),
  sujet TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. COMMANDES
CREATE TABLE commandes (
  id SERIAL PRIMARY KEY,
  ref TEXT UNIQUE NOT NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  montant NUMERIC DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  statut TEXT DEFAULT 'en_cours' CHECK (statut IN ('en_cours','livree','annulee')),
  livraison DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. FACTURES
CREATE TABLE factures (
  id SERIAL PRIMARY KEY,
  ref TEXT UNIQUE NOT NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  montant NUMERIC DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  echeance DATE,
  statut TEXT DEFAULT 'attente' CHECK (statut IN ('payee','attente','retard')),
  jours_retard INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. COMPTES-RENDUS
CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  titre TEXT NOT NULL,
  contenu TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. COMMERCIAUX
CREATE TABLE commerciaux (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  ca NUMERIC DEFAULT 0,
  obj NUMERIC DEFAULT 0,
  clients_count INTEGER DEFAULT 0,
  taux_conversion TEXT DEFAULT '0%',
  score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. NOTIFICATIONS
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  type TEXT DEFAULT 'info' CHECK (type IN ('danger','success','warn','info')),
  text TEXT NOT NULL,
  time_label TEXT DEFAULT '',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- ACTIVER ROW LEVEL SECURITY (RLS)
-- Politique ouverte pour commencer (tous les users authentifiés)
-- ================================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE devis ENABLE ROW LEVEL SECURITY;
ALTER TABLE commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerciaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Politique : accès complet pour les utilisateurs authentifiés
-- (on pourra restreindre plus tard par rôle/équipe)
CREATE POLICY "Accès complet auth" ON clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Accès complet auth" ON devis FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Accès complet auth" ON commandes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Accès complet auth" ON factures FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Accès complet auth" ON reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Accès complet auth" ON commerciaux FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Accès complet auth" ON notifications FOR ALL USING (true) WITH CHECK (true);

-- ================================================
-- DONNÉES DE DÉMO (les mêmes que le CRM actuel)
-- ================================================

INSERT INTO clients (id, name, code, ca, obj, margin, dso, score, color, ini, sector, contact, email, phone, status, lat, lng, city, sentiment_pos, sentiment_neu, sentiment_neg, last_contact) VALUES
  ('enedis', 'Enedis Grand Ouest', 'CLI-0042', 245800, 280000, 42, 38, 87, '#4f8ff7,#3b73d9', 'EN', 'Énergie', 'P. Moreau', 'p.moreau@enedis.fr', '+33 2 98 44 12 00', 'advance', 48.39, -4.48, 'Brest', 72, 22, 6, NOW()),
  ('naval', 'Naval Group', 'CLI-0018', 198400, 200000, 38, 45, 82, '#8b5cf6,#7c3aed', 'NG', 'Défense', 'C. Dubois', 'c.dubois@naval-group.com', '+33 2 98 34 56 00', 'objectif', 48.38, -4.50, 'Brest', 65, 28, 7, NOW() - INTERVAL '1 day'),
  ('thales', 'Thales', 'CLI-0007', 167200, 250000, 35, 62, 58, '#f59e0b,#d97706', 'TH', 'Défense & Aéro', 'L. Martin', 'l.martin@thales.com', '+33 1 73 32 00 00', 'retard', 48.83, 2.27, 'Paris', 48, 35, 17, NOW() - INTERVAL '3 days'),
  ('safran', 'Safran Tech', 'CLI-0031', 142600, 180000, 40, 42, 74, '#10b981,#059669', 'SF', 'Aéronautique', 'A. Bernard', 'a.bernard@safrangroup.com', '+33 1 40 60 80 00', 'objectif', 48.77, 2.01, 'Massy', 60, 30, 10, NOW() - INTERVAL '5 days'),
  ('airbus', 'Airbus Defence', 'CLI-0055', 89300, 150000, 32, 55, 45, '#ef4444,#dc2626', 'AD', 'Aéronautique', 'M. Petit', 'm.petit@airbus.com', '+33 5 61 93 33 33', 'retard', 43.63, 1.37, 'Toulouse', 35, 40, 25, NOW() - INTERVAL '12 days'),
  ('dassault', 'Dassault Systèmes', 'CLI-0063', 134500, 160000, 44, 35, 80, '#06b6d4,#0891b2', 'DS', 'Tech', 'J. Leroy', 'j.leroy@3ds.com', '+33 1 61 62 61 62', 'advance', 48.82, 2.13, 'Vélizy', 70, 24, 6, NOW() - INTERVAL '2 days'),
  ('edf', 'EDF Renouvelables', 'CLI-0071', 112000, 120000, 37, 40, 78, '#84cc16,#65a30d', 'EF', 'Énergie', 'N. Simon', 'n.simon@edf.fr', '+33 1 40 42 22 22', 'advance', 48.87, 2.33, 'Paris', 64, 28, 8, NOW() - INTERVAL '7 days'),
  ('orange', 'Orange Business', 'CLI-0089', 78000, 130000, 28, 68, 38, '#f97316,#ea580c', 'OB', 'Telecom', 'D. Laurent', 'd.laurent@orange.com', '+33 1 44 44 22 22', 'retard', 48.84, 2.26, 'Paris', 30, 38, 32, NOW() - INTERVAL '15 days');

INSERT INTO devis (ref, client_id, client_name, montant, date, statut, sujet) VALUES
  ('DV-2024-089', 'enedis', 'Enedis Grand Ouest', 85000, '2024-03-01', 'accepted', 'Migration infra cloud'),
  ('DV-2024-092', 'naval', 'Naval Group', 124000, '2024-03-05', 'pending', 'Cybersécurité OT'),
  ('DV-2024-094', 'thales', 'Thales', 67500, '2024-03-08', 'pending', 'Formation DevSecOps'),
  ('DV-2024-095', 'safran', 'Safran Tech', 93000, '2024-03-09', 'sent', 'Audit SI industriel'),
  ('DV-2024-088', 'dassault', 'Dassault Systèmes', 156000, '2024-02-28', 'accepted', 'Intégration PLM'),
  ('DV-2024-091', 'enedis', 'Enedis Grand Ouest', 42000, '2024-03-04', 'sent', 'Extension monitoring'),
  ('DV-2024-096', 'edf', 'EDF Renouvelables', 78000, '2024-03-10', 'pending', 'Dashboard énergie');

INSERT INTO commandes (ref, client_id, client_name, montant, date, statut, livraison) VALUES
  ('CM-2024-041', 'enedis', 'Enedis Grand Ouest', 85000, '2024-03-02', 'en_cours', '2024-06-15'),
  ('CM-2024-039', 'naval', 'Naval Group', 156000, '2024-02-15', 'en_cours', '2024-05-30'),
  ('CM-2024-037', 'dassault', 'Dassault Systèmes', 92000, '2024-02-01', 'livree', '2024-03-01'),
  ('CM-2024-040', 'safran', 'Safran Tech', 64000, '2024-02-20', 'en_cours', '2024-04-30'),
  ('CM-2024-038', 'edf', 'EDF Renouvelables', 78000, '2024-02-10', 'livree', '2024-03-10');

INSERT INTO factures (ref, client_id, client_name, montant, date, echeance, statut, jours_retard) VALUES
  ('FA-2024-156', 'thales', 'Thales', 45000, '2024-02-01', '2024-03-01', 'retard', 6),
  ('FA-2024-155', 'orange', 'Orange Business', 56000, '2024-02-10', '2024-03-10', 'retard', 0),
  ('FA-2024-158', 'enedis', 'Enedis Grand Ouest', 85000, '2024-03-05', '2024-04-05', 'attente', 0),
  ('FA-2024-157', 'naval', 'Naval Group', 156000, '2024-03-01', '2024-04-01', 'attente', 0),
  ('FA-2024-153', 'dassault', 'Dassault Systèmes', 92000, '2024-01-15', '2024-02-15', 'payee', 0),
  ('FA-2024-154', 'safran', 'Safran Tech', 64000, '2024-01-20', '2024-02-20', 'payee', 0);

INSERT INTO reports (client_id, client_name, date, titre, contenu) VALUES
  ('enedis', 'Enedis Grand Ouest', NOW(), 'Réunion de suivi — Migration cloud', 'Points abordés : avancement Phase 2, planification des tests UAT, validation du budget complémentaire. Le client souhaite accélérer la livraison. Prochaine réunion prévue le 20/03.'),
  ('naval', 'Naval Group', NOW() - INTERVAL '1 day', 'Kick-off Cybersécurité OT', 'Présentation de l''équipe projet, revue du périmètre, jalons clés définis pour Q2. Le RSSI demande un audit préliminaire.'),
  ('thales', 'Thales', '2024-03-04', 'Point commercial trimestriel', 'Bilan Q1, discussion sur le renouvellement du contrat cadre, opportunités identifiées sur le segment aéronautique.');

INSERT INTO commerciaux (nom, ca, obj, clients_count, taux_conversion, score) VALUES
  ('Marc Bertrand', 480000, 600000, 8, '42%', 78),
  ('Sophie Lemaire', 520000, 650000, 10, '38%', 82),
  ('Thomas Renaud', 420000, 670000, 6, '31%', 65);

INSERT INTO notifications (type, text, time_label, read) VALUES
  ('danger', '<strong>Facture FA-2024-156</strong> en retard de 6 jours — Thales', 'Il y a 30 min', false),
  ('success', '<strong>Devis DV-2024-089</strong> accepté — Enedis Grand Ouest', 'Il y a 1h', false),
  ('warn', '<strong>Score client</strong> Orange Business en baisse (38/100)', 'Il y a 2h', false),
  ('info', 'Nouveau compte-rendu ajouté pour <strong>Naval Group</strong>', 'Il y a 3h', true),
  ('success', '<strong>Commande CM-2024-041</strong> confirmée — Enedis', 'Hier', true);
