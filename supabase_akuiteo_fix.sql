-- ================================================
-- FIX : Corriger le format des critères de recherche Akuiteo
-- Le format correct est : {"code": {"operator": "LIKE", "value": "%"}}
-- Exécuter dans : Supabase > SQL Editor > New Query
-- ================================================

-- Remplacer la fonction de recherche avec le bon format de critères
CREATE OR REPLACE FUNCTION akuiteo_search_customers(search_text TEXT DEFAULT NULL, max_results INT DEFAULT 500)
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
    -- Recherche par nom avec le texte fourni
    req_body := jsonb_build_object(
      'name', jsonb_build_object('operator', 'LIKE', 'value', '%' || search_text || '%')
    );
  ELSE
    -- Lister tous les clients : recherche large par code
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

-- Redonner les droits
GRANT EXECUTE ON FUNCTION akuiteo_search_customers(TEXT, INT) TO authenticated;
