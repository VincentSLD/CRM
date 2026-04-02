-- Table des absences Lucca
CREATE TABLE IF NOT EXISTS absences_lucca (
  id TEXT PRIMARY KEY,
  lucca_id TEXT NOT NULL,
  date_absence DATE,
  periode TEXT,
  type_absence TEXT,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_absences_lucca_user ON absences_lucca(lucca_id);
CREATE INDEX IF NOT EXISTS idx_absences_lucca_date ON absences_lucca(date_absence);

ALTER TABLE absences_lucca ENABLE ROW LEVEL SECURITY;
CREATE POLICY "absences_lucca_all" ON absences_lucca FOR ALL USING (true) WITH CHECK (true);
