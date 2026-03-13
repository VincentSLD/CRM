-- ================================================
-- CRM Akuiteo — Ajout du lien commercial ↔ accountManager Akuiteo
-- Exécuter dans : Supabase > SQL Editor > New Query
-- ================================================

-- 1. Ajouter akuiteo_manager_id sur les commerciaux
ALTER TABLE commerciaux ADD COLUMN IF NOT EXISTS akuiteo_manager_id TEXT;

-- 2. Ajouter account_manager_id sur les clients (stocke l'ID du commercial Akuiteo)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_manager_id TEXT;

-- 3. Index pour filtrage rapide
CREATE INDEX IF NOT EXISTS idx_clients_account_manager ON clients(account_manager_id);
CREATE INDEX IF NOT EXISTS idx_commerciaux_akuiteo_manager ON commerciaux(akuiteo_manager_id);
