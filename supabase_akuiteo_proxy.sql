-- ================================================
-- CRM Akuiteo — Proxy API via PostgreSQL
-- Exécuter dans : Supabase > SQL Editor > New Query
-- ================================================

-- 1. Activer l'extension HTTP (permet d'appeler des APIs depuis PostgreSQL)
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- 1b. Ajouter la colonne akuiteo_id à la table clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS akuiteo_id TEXT;

-- 2. Stocker les credentials Akuiteo de manière sécurisée
-- (dans une table accessible uniquement côté serveur)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
-- Aucune policy = inaccessible depuis le client, uniquement via les fonctions SECURITY DEFINER

INSERT INTO app_settings (key, value) VALUES
  ('akuiteo_base_url', 'https://novamingenierie-test.myakuiteo.com:443/akuiteo/rest/crm')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO app_settings (key, value) VALUES
  ('akuiteo_auth', encode(convert_to('API1:API1', 'UTF8'), 'base64'))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 3. Fonction : Lister les clients Akuiteo
CREATE OR REPLACE FUNCTION akuiteo_search_customers(search_text TEXT DEFAULT NULL, max_results INT DEFAULT 100)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_url TEXT;
  auth_header TEXT;
  req_body JSONB;
  response extensions.http_response;
BEGIN
  SELECT value INTO base_url FROM app_settings WHERE key = 'akuiteo_base_url';
  SELECT value INTO auth_header FROM app_settings WHERE key = 'akuiteo_auth';

  -- Format Akuiteo : chaque champ est un objet Clause {operator, value}
  -- Les opérateurs doivent être en MAJUSCULES : LIKE, IS, IS_NOT, IN, etc.
  IF search_text IS NOT NULL AND search_text != '' THEN
    req_body := jsonb_build_object(
      'name', jsonb_build_object('operator', 'LIKE', 'value', '%' || search_text || '%')
    );
  ELSE
    req_body := jsonb_build_object(
      'code', jsonb_build_object('operator', 'LIKE', 'value', '%')
    );
  END IF;

  SELECT * INTO response FROM extensions.http((
    'POST',
    base_url || '/customers/search?limit=' || max_results,
    ARRAY[
      extensions.http_header('Authorization', 'Basic ' || auth_header),
      extensions.http_header('Accept', 'application/json')
    ],
    'application/json',
    req_body::TEXT
  )::extensions.http_request);

  IF response.status = 200 THEN
    RETURN response.content::JSONB;
  ELSE
    RETURN jsonb_build_object('error', true, 'status', response.status, 'message', response.content);
  END IF;
END;
$$;

-- 4. Fonction : Détail d'un client Akuiteo
CREATE OR REPLACE FUNCTION akuiteo_get_customer(customer_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_url TEXT;
  auth_header TEXT;
  response extensions.http_response;
BEGIN
  SELECT value INTO base_url FROM app_settings WHERE key = 'akuiteo_base_url';
  SELECT value INTO auth_header FROM app_settings WHERE key = 'akuiteo_auth';

  SELECT * INTO response FROM extensions.http((
    'GET',
    base_url || '/customers/' || customer_id,
    ARRAY[
      extensions.http_header('Authorization', 'Basic ' || auth_header),
      extensions.http_header('Accept', 'application/json')
    ],
    NULL,
    NULL
  )::extensions.http_request);

  IF response.status = 200 THEN
    RETURN response.content::JSONB;
  ELSE
    RETURN jsonb_build_object('error', true, 'status', response.status, 'message', response.content);
  END IF;
END;
$$;

-- 5. Fonction : Créer un client dans Akuiteo
CREATE OR REPLACE FUNCTION akuiteo_create_customer(customer_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_url TEXT;
  auth_header TEXT;
  response extensions.http_response;
BEGIN
  SELECT value INTO base_url FROM app_settings WHERE key = 'akuiteo_base_url';
  SELECT value INTO auth_header FROM app_settings WHERE key = 'akuiteo_auth';

  SELECT * INTO response FROM extensions.http((
    'PUT',
    base_url || '/customers',
    ARRAY[
      extensions.http_header('Authorization', 'Basic ' || auth_header),
      extensions.http_header('Accept', 'application/json')
    ],
    'application/json',
    customer_data::TEXT
  )::extensions.http_request);

  IF response.status IN (200, 201) THEN
    RETURN jsonb_build_object('success', true, 'id', response.content);
  ELSE
    RETURN jsonb_build_object('error', true, 'status', response.status, 'message', response.content);
  END IF;
END;
$$;

-- 6. Fonction : Modifier un client dans Akuiteo
CREATE OR REPLACE FUNCTION akuiteo_update_customer(customer_id TEXT, customer_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_url TEXT;
  auth_header TEXT;
  response extensions.http_response;
BEGIN
  SELECT value INTO base_url FROM app_settings WHERE key = 'akuiteo_base_url';
  SELECT value INTO auth_header FROM app_settings WHERE key = 'akuiteo_auth';

  SELECT * INTO response FROM extensions.http((
    'POST',
    base_url || '/customers/' || customer_id,
    ARRAY[
      extensions.http_header('Authorization', 'Basic ' || auth_header),
      extensions.http_header('Accept', 'application/json')
    ],
    'application/json',
    customer_data::TEXT
  )::extensions.http_request);

  IF response.status IN (200, 204) THEN
    RETURN jsonb_build_object('success', true);
  ELSE
    RETURN jsonb_build_object('error', true, 'status', response.status, 'message', response.content);
  END IF;
END;
$$;

-- 7. Fonction : Récupérer les contacts d'un client Akuiteo
CREATE OR REPLACE FUNCTION akuiteo_get_contacts(customer_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_url TEXT;
  auth_header TEXT;
  response extensions.http_response;
BEGIN
  SELECT value INTO base_url FROM app_settings WHERE key = 'akuiteo_base_url';
  SELECT value INTO auth_header FROM app_settings WHERE key = 'akuiteo_auth';

  SELECT * INTO response FROM extensions.http((
    'GET',
    base_url || '/customers/' || customer_id || '/contacts',
    ARRAY[
      extensions.http_header('Authorization', 'Basic ' || auth_header),
      extensions.http_header('Accept', 'application/json')
    ],
    NULL,
    NULL
  )::extensions.http_request);

  IF response.status = 200 THEN
    RETURN response.content::JSONB;
  ELSE
    RETURN jsonb_build_object('error', true, 'status', response.status, 'message', response.content);
  END IF;
END;
$$;

-- 8. Fonction : Rechercher les opportunités Akuiteo
CREATE OR REPLACE FUNCTION akuiteo_search_opportunities(search_criteria JSONB DEFAULT '{}'::JSONB, max_results INT DEFAULT 100)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_url TEXT;
  auth_header TEXT;
  response extensions.http_response;
BEGIN
  SELECT value INTO base_url FROM app_settings WHERE key = 'akuiteo_base_url';
  SELECT value INTO auth_header FROM app_settings WHERE key = 'akuiteo_auth';

  SELECT * INTO response FROM extensions.http((
    'POST',
    base_url || '/opportunities/search?limit=' || max_results,
    ARRAY[
      extensions.http_header('Authorization', 'Basic ' || auth_header),
      extensions.http_header('Accept', 'application/json')
    ],
    'application/json',
    search_criteria::TEXT
  )::extensions.http_request);

  IF response.status = 200 THEN
    RETURN response.content::JSONB;
  ELSE
    RETURN jsonb_build_object('error', true, 'status', response.status, 'message', response.content);
  END IF;
END;
$$;

-- 9. Donner accès aux fonctions pour les utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION akuiteo_search_customers(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION akuiteo_get_customer(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION akuiteo_create_customer(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION akuiteo_update_customer(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION akuiteo_get_contacts(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION akuiteo_search_opportunities(JSONB, INT) TO authenticated;
