-- =============================================================
-- ÉTAPE 2 : PURGE DES DONNÉES SYNCHRONISÉES DEPUIS AKUITEO
-- À exécuter dans la console SQL de Supabase
--
-- IMPORTANT : Exécuter d'abord step1_verification.sql
--             et vérifier les comptages avant de lancer ce script
-- =============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. Supprimer les affaires synchronisées depuis Akuiteo
--    (référencées par devis/commandes/factures avec SET NULL)
-- ---------------------------------------------------------------
DELETE FROM affaires WHERE akuiteo_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 2. Supprimer les marchés synchronisés depuis Akuiteo
--    (référencés par affaires avec SET NULL - déjà supprimées)
-- ---------------------------------------------------------------
DELETE FROM marches WHERE akuiteo_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 3. Supprimer les documents synchronisés depuis Akuiteo
--    On les supprime EXPLICITEMENT avant les clients pour éviter
--    que le CASCADE ne supprime aussi des données locales liées
--    à des clients Akuiteo
-- ---------------------------------------------------------------
DELETE FROM factures WHERE akuiteo_id IS NOT NULL;
DELETE FROM commandes WHERE akuiteo_id IS NOT NULL;
DELETE FROM devis WHERE akuiteo_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 4. Supprimer les contacts synchronisés depuis Akuiteo
-- ---------------------------------------------------------------
DELETE FROM contacts WHERE akuiteo_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 5. Supprimer les clients synchronisés depuis Akuiteo
--    Le CASCADE supprimera aussi les éventuels reports liés
--    et mettra à NULL le report_id des envois concernés
-- ---------------------------------------------------------------
DELETE FROM clients WHERE akuiteo_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 6. Vider la table des exclusions de synchronisation
--    (permet de repartir de zéro, tous les clients seront re-syncés)
-- ---------------------------------------------------------------
TRUNCATE sync_exclusions;

-- ---------------------------------------------------------------
-- 7. Réinitialiser le timestamp de dernière synchronisation
--    Force la prochaine synchro à récupérer TOUTES les données
-- ---------------------------------------------------------------
DELETE FROM crm_config WHERE key = 'last_sync_timestamp';

-- ---------------------------------------------------------------
-- 8. Nettoyer les objectifs_clients orphelins (pas de FK)
--    Supprime les objectifs liés à des clients qui n'existent plus
-- ---------------------------------------------------------------
DELETE FROM objectifs_clients
WHERE client_id NOT IN (SELECT id FROM clients);

COMMIT;

-- ---------------------------------------------------------------
-- VÉRIFICATION POST-PURGE
-- ---------------------------------------------------------------
SELECT 'clients' AS table_name, COUNT(*) AS restants FROM clients
UNION ALL SELECT 'contacts', COUNT(*) FROM contacts
UNION ALL SELECT 'devis', COUNT(*) FROM devis
UNION ALL SELECT 'commandes', COUNT(*) FROM commandes
UNION ALL SELECT 'factures', COUNT(*) FROM factures
UNION ALL SELECT 'marches', COUNT(*) FROM marches
UNION ALL SELECT 'affaires', COUNT(*) FROM affaires
UNION ALL SELECT 'sync_exclusions', COUNT(*) FROM sync_exclusions
ORDER BY table_name;
