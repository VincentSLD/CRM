// Proxy GET générique pour les API open data qui n'autorisent pas le CORS navigateur
// (ex. data.ademe.fr, api.bdnb.io). Restreint à une liste d'hôtes autorisés (anti-SSRF).
// Usage côté client : fetch('/api/proxy?url=' + encodeURIComponent(urlComplète))

const ALLOWED_HOSTS = [
  'data.ademe.fr',
  'api.bdnb.io',
  'opendata.koumoul.com',
  'api-lannuaire.service-public.gouv.fr',
  'recherche-entreprises.api.gouv.fr',
  'georisques.gouv.fr',
  'boamp-datadila.opendatasoft.com',
  'geo.api.gouv.fr',
];

export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'paramètre url requis' });
  let u;
  try { u = new URL(target); } catch (e) { return res.status(400).json({ error: 'url invalide' }); }
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) {
    return res.status(403).json({ error: 'hôte non autorisé' });
  }
  try {
    const r = await fetch(target, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; CRM-NOVAM/1.0; +https://novam-ingenierie.com)' } });
    const txt = await r.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json; charset=utf-8');
    // Cache léger côté CDN pour soulager les API publiques
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(r.status).send(txt);
  } catch (e) {
    return res.status(502).json({ error: 'proxy: ' + e.message });
  }
}
