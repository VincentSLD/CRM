// Proxy BDNB Open API — https://api.bdnb.io/v1/bdnb
// Doc : https://bdnb.io/blog/25/01/2024/new_sortie_api_bdnb/
// Syntaxe filtres PostgREST : "code_commune_insee=eq.44109"
// Clé API à configurer dans les variables d'env Vercel : BDNB_API_KEY
const BDNB_BASE = 'https://api.bdnb.io/v1/bdnb';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const KEY = process.env.BDNB_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'BDNB_API_KEY not configured (set it in Vercel env)' });

  const { path, ...params } = req.query || {};
  if (!path) return res.status(400).json({ error: 'Missing path. Ex: path=donnees/batiment_groupe_complet' });

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach(x => qs.append(k, x));
    else if (v != null && v !== '') qs.set(k, v);
  }
  const url = BDNB_BASE + '/' + String(path).replace(/^\/+/, '') + (qs.toString() ? '?' + qs.toString() : '');

  try {
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        // L'API BDNB attend la clé via header (selon le portail) — on essaie X-Api-Key
        'X-Api-Key': KEY,
        'Authorization': 'Bearer ' + KEY,
      }
    });
    const text = await r.text();
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(502).json({ error: 'BDNB proxy error: ' + e.message, url });
  }
}
