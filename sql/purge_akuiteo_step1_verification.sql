-- =============================================================
-- ÉTAPE 1 : VÉRIFICATION AVANT PURGE
-- À exécuter dans la console SQL de Supabase AVANT la purge
-- Ne modifie aucune donnée - lecture seule
-- =============================================================

-- Comptage des enregistrements par source (Akuiteo vs Local)
SELECT 'clients' AS table_name,
  COUNT(*) FILTER (WHERE akuiteo_id IS NOT NULL) AS akuiteo,
  COUNT(*) FILTER (WHERE akuiteo_id IS NULL) AS local,
  COUNT(*) AS total
FROM clients
UNION ALL
SELECT 'contacts',
  COUNT(*) FILTER (WHERE akuiteo_id IS NOT NULL),
  COUNT(*) FILTER (WHERE akuiteo_id IS NULL),
  COUNT(*)
FROM contacts
UNION ALL
SELECT 'devis',
  COUNT(*) FILTER (WHERE akuiteo_id IS NOT NULL),
  COUNT(*) FILTER (WHERE akuiteo_id IS NULL),
  COUNT(*)
FROM devis
UNION ALL
SELECT 'commandes',
  COUNT(*) FILTER (WHERE akuiteo_id IS NOT NULL),
  COUNT(*) FILTER (WHERE akuiteo_id IS NULL),
  COUNT(*)
FROM commandes
UNION ALL
SELECT 'factures',
  COUNT(*) FILTER (WHERE akuiteo_id IS NOT NULL),
  COUNT(*) FILTER (WHERE akuiteo_id IS NULL),
  COUNT(*)
FROM factures
UNION ALL
SELECT 'marches',
  COUNT(*) FILTER (WHERE akuiteo_id IS NOT NULL),
  COUNT(*) FILTER (WHERE akuiteo_id IS NULL),
  COUNT(*)
FROM marches
UNION ALL
SELECT 'affaires',
  COUNT(*) FILTER (WHERE akuiteo_id IS NOT NULL),
  COUNT(*) FILTER (WHERE akuiteo_id IS NULL),
  COUNT(*)
FROM affaires
UNION ALL
SELECT 'sync_exclusions',
  COUNT(*),
  0,
  COUNT(*)
FROM sync_exclusions
ORDER BY table_name;

-- Vérification de sécurité : comptes-rendus (reports) liés à des clients Akuiteo
-- Ces reports seront supprimés en CASCADE si on supprime le client
SELECT 'reports liés à clients Akuiteo (seront supprimés en CASCADE)' AS alerte,
  COUNT(*) AS nombre
FROM reports r
JOIN clients c ON r.client_id = c.id
WHERE c.akuiteo_id IS NOT NULL;

-- Vérification de sécurité : envois liés à des reports de clients Akuiteo
-- Le report_id sera mis à NULL (SET NULL)
SELECT 'envois liés à reports de clients Akuiteo (report_id sera mis à NULL)' AS alerte,
  COUNT(*) AS nombre
FROM envois e
JOIN reports r ON e.report_id = r.id
JOIN clients c ON r.client_id = c.id
WHERE c.akuiteo_id IS NOT NULL;

-- Vérification : données locales orphelines potentielles
-- Contacts locaux liés à des clients Akuiteo (seraient supprimés en CASCADE)
SELECT 'contacts LOCAUX liés à clients Akuiteo (ATTENTION: seront perdus)' AS alerte,
  COUNT(*) AS nombre
FROM contacts ct
JOIN clients c ON ct.client_id = c.id
WHERE ct.akuiteo_id IS NULL AND c.akuiteo_id IS NOT NULL;

-- Devis locaux liés à des clients Akuiteo
SELECT 'devis LOCAUX liés à clients Akuiteo (ATTENTION: seront perdus)' AS alerte,
  COUNT(*) AS nombre
FROM devis d
JOIN clients c ON d.client_id = c.id
WHERE d.akuiteo_id IS NULL AND c.akuiteo_id IS NOT NULL;

-- Commandes locales liées à des clients Akuiteo
SELECT 'commandes LOCALES liées à clients Akuiteo (ATTENTION: seront perdues)' AS alerte,
  COUNT(*) AS nombre
FROM commandes cmd
JOIN clients c ON cmd.client_id = c.id
WHERE cmd.akuiteo_id IS NULL AND c.akuiteo_id IS NOT NULL;

-- Objectifs clients liés à des clients Akuiteo (pas de FK, resteront orphelins)
SELECT 'objectifs_clients liés à clients Akuiteo (resteront orphelins)' AS alerte,
  COUNT(*) AS nombre
FROM objectifs_clients oc
JOIN clients c ON oc.client_id = c.id
WHERE c.akuiteo_id IS NOT NULL;
