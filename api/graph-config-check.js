// Diagnostic de configuration Microsoft Graph (Vercel).
//
// Permet de vérifier ce que Vercel a réellement enregistré, sans exposer le secret :
//  - AZURE_TENANT_ID et AZURE_CLIENT_ID sont des identifiants publics (affichés en clair)
//  - AZURE_CLIENT_SECRET : seules sa présence et sa longueur sont renvoyées
//
// À supprimer (ou laisser) une fois la configuration validée.
// Usage : ouvrir https://<votre-app>/api/graph-config-check

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const tenant = process.env.AZURE_TENANT_ID || null;
  const clientId = process.env.AZURE_CLIENT_ID || null;
  const secret = process.env.AZURE_CLIENT_SECRET || null;

  const isGuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  return res.status(200).json({
    AZURE_TENANT_ID: tenant,
    AZURE_CLIENT_ID: clientId,
    AZURE_CLIENT_SECRET_present: !!secret,
    AZURE_CLIENT_SECRET_length: secret ? secret.length : 0,
    tenant_is_guid: isGuid(tenant),
    client_is_guid: isGuid(clientId),
    tenant_equals_client: !!tenant && tenant === clientId,
    hint: (!!tenant && tenant === clientId)
      ? '⚠️ TENANT_ID et CLIENT_ID sont identiques : vous avez probablement recopié le Client ID dans AZURE_TENANT_ID.'
      : (!isGuid(tenant) ? '⚠️ AZURE_TENANT_ID ne ressemble pas à un GUID.' : 'OK — vérifiez que ces valeurs correspondent à votre app Entra.')
  });
}
