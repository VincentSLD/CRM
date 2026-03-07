-- ================================================
-- CRM Akuiteo — Migration Authentification
-- Exécuter dans : Supabase > SQL Editor > New Query
-- ================================================

-- 1. Ajouter user_id aux commerciaux (lien avec Supabase Auth)
ALTER TABLE commerciaux ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id);
ALTER TABLE commerciaux ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE commerciaux ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'commercial' CHECK (role IN ('admin','commercial','manager'));

-- 2. Ajouter created_by sur les tables principales (tracer qui crée quoi)
ALTER TABLE devis ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE factures ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 3. Politique RLS : accès pour les utilisateurs authentifiés (remplace l'ancienne)
-- Supprime les anciennes politiques ouvertes
DROP POLICY IF EXISTS "Accès complet auth" ON clients;
DROP POLICY IF EXISTS "Accès complet auth" ON devis;
DROP POLICY IF EXISTS "Accès complet auth" ON commandes;
DROP POLICY IF EXISTS "Accès complet auth" ON factures;
DROP POLICY IF EXISTS "Accès complet auth" ON reports;
DROP POLICY IF EXISTS "Accès complet auth" ON commerciaux;
DROP POLICY IF EXISTS "Accès complet auth" ON notifications;

-- Nouvelles politiques : seuls les utilisateurs connectés peuvent accéder
CREATE POLICY "Auth users full access" ON clients FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access" ON devis FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access" ON commandes FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access" ON factures FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access" ON reports FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access" ON commerciaux FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access" ON notifications FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- 4. Fonction pour créer automatiquement un profil commercial à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.commerciaux (user_id, email, nom, ca, obj, clients_count, taux_conversion, score)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    0, 0, 0, '0%', 0
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger : à chaque inscription, un profil commercial est créé
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
