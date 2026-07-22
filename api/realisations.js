// Enrichissement « Réalisations » d'un client (fiche client CRM) :
//   - Marchés publics gagnés  → DECP (open data data.economie.gouv.fr, SANS clé)
//   - Permis de construire     → PermisAPI (clé serveur PERMISAPI_KEY)
//
// Appel : GET /api/realisations?siren=<9 chiffres>&name=<raison sociale>&depts=85,44
//
// Variables d'environnement (Vercel) :
//   - PERMISAPI_KEY  (optionnel) : clé PermisAPI (pk_live_… / pk_test_…). Absente → volet permis désactivé (le reste fonctionne).
//   - PERMISAPI_BASE (optionnel) : défaut https://api.permisapi.fr/v1

const PERMISAPI_KEY = process.env.PERMISAPI_KEY || '';
const PERMISAPI_BASE = (process.env.PERMISAPI_BASE || 'https://api.permisapi.fr/v1').replace(/\/+$/, '');
const DECP_URL = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/decp_augmente/records';

async function fetchJson(url, opts, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...(opts || {}), signal: ctrl.signal });
    const txt = await r.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) {}
    return { ok: r.ok, status: r.status, data, text: txt };
  } catch (e) {
    return { ok: false, status: 0, data: null, text: String(e && e.message || e) };
  } finally { clearTimeout(t); }
}

// ─ DECP : marchés publics où l'entreprise est titulaire (par SIREN) ─
async function loadDecp(siren) {
  if (!siren) return { items: [], total: 0, error: null };
  // ODSQL : startswith() pour un préfixe SIREN (le joker ODS est « * », pas « % » comme en SQL)
  const where = `startswith(siretetablissement, "${siren}")`;
  const select = 'datenotification,nomacheteur,objetmarche,montant,codedepartementexecution,natureobjetmarche,codecpv,dureemois';
  const url = DECP_URL + '?where=' + encodeURIComponent(where)
    + '&order_by=' + encodeURIComponent('datenotification desc')
    + '&limit=60&select=' + encodeURIComponent(select);
  const r = await fetchJson(url);
  if (!r.ok) return { items: [], total: 0, error: 'DECP ' + r.status + ': ' + String((r.data && r.data.message) || r.text).slice(0, 160) };
  const items = ((r.data && r.data.results) || []).map(x => ({
    date: String(x.datenotification || '').slice(0, 10),
    acheteur: x.nomacheteur || '',
    objet: x.objetmarche || '',
    montant: (x.montant != null && x.montant !== '') ? Number(x.montant) : null,
    dept: x.codedepartementexecution || '',
    nature: x.natureobjetmarche || '',
    duree: x.dureemois || null,
  }));
  return { items, total: (r.data && r.data.total_count) != null ? r.data.total_count : items.length, error: null };
}

// ─ PermisAPI : normalisation (champs réels : num_pa, date_reelle_autorisation, permit_type, superficie_terrain, denom_dem, siren_dem, adr_localite_ter, full_address, comm_code, etat_pa) ─
function normPermit(p) {
  const g = (...keys) => { for (const k of keys) { if (p && p[k] != null && p[k] !== '') return p[k]; } return ''; };
  return {
    num: g('num_pa', 'numero', 'id'),
    date: String(g('date_reelle_autorisation', 'date', 'an_depot')).slice(0, 10),
    type: g('permit_type', 'type', 'nature_projet'),
    surface: g('superficie_terrain', 'cadastre_surface', 'surface_plancher', 'surface'),
    petitionnaire: g('denom_dem', 'petitionnaire', 'demandeur', 'nom_demandeur'),
    sirenDem: String(g('siren_dem') || '').replace(/\D/g, ''),
    commune: g('adr_localite_ter', 'commune', 'nom_commune', 'ville'),
    cp: g('comm_code', 'code_postal', 'code_insee'),
    adresse: g('full_address', 'adresse', 'adresse_terrain'),
    statut: g('etat_pa', 'statut', 'etat'),
  };
}
async function loadPermis(siren, depts, debug) {
  if (!PERMISAPI_KEY) return { configured: false, items: [], error: null };
  // PermisAPI attend la clé dans le header X-API-Key (on envoie aussi Authorization: Bearer par sécurité)
  const headers = { 'X-API-Key': PERMISAPI_KEY, 'Authorization': 'Bearer ' + PERMISAPI_KEY, 'Accept': 'application/json' };
  const pull = async url => {
    const r = await fetchJson(url, { headers });
    if (!r.ok) return { arr: null, err: 'PermisAPI ' + r.status + ': ' + String((r.data && (r.data.message || r.data.detail || r.data.error)) || r.text).slice(0, 200) };
    const arr = (r.data && (r.data.data || r.data.results || r.data.permits || r.data.items)) || (Array.isArray(r.data) ? r.data : []);
    return { arr: arr || [], err: null };
  };
  let error = null, sampleKeys = null, raw = [], serverFiltered = false;
  // 1) Filtre serveur précis par SIREN du demandeur (national) — best-effort selon les paramètres supportés
  if (siren) {
    const r1 = await pull(PERMISAPI_BASE + '/permits?siren_dem=' + encodeURIComponent(siren) + '&per_page=100');
    if (r1.err) error = r1.err;
    else if (r1.arr.length) {
      if (r1.arr[0] && !sampleKeys) sampleKeys = Object.keys(r1.arr[0]);
      // Le filtre serveur a-t-il vraiment agi ? (toutes les lignes doivent porter ce SIREN)
      const allMatch = r1.arr.every(p => String(p.siren_dem || '').replace(/\D/g, '') === siren);
      if (allMatch) { raw = r1.arr; serverFiltered = true; }
    }
  }
  // 2) Sinon, repli par département puis filtre client sur siren_dem exact
  if (!serverFiltered) {
    for (const dep of (depts || []).filter(Boolean).slice(0, 3)) {
      const r2 = await pull(PERMISAPI_BASE + '/permits?dep_code=' + encodeURIComponent(dep) + '&per_page=100');
      if (r2.err) { error = r2.err; continue; }
      if (r2.arr.length && !sampleKeys) sampleKeys = Object.keys(r2.arr[0]);
      raw = raw.concat(r2.arr);
    }
  }
  // Normalisation + déduplication
  const seen = new Set(); let items = [];
  for (const p of raw) {
    const np = normPermit(p);
    const key = np.num || (p.id != null ? String(p.id) : '');
    if (key && seen.has(key)) continue; if (key) seen.add(key);
    items.push(np);
  }
  // Filtre PRÉCIS : uniquement les permis où l'entreprise est le pétitionnaire (siren_dem = SIREN)
  if (siren) items = items.filter(p => p.sirenDem === siren);
  return { configured: true, items: items.slice(0, 100), count: items.length, serverFiltered, error, sampleKeys: debug ? sampleKeys : undefined };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = req.query || {};
  const siren = String(q.siren || '').replace(/\D/g, '').slice(0, 9);
  const name = String(q.name || '').trim();
  const depts = String(q.depts || '').split(',').map(s => s.trim()).filter(Boolean);
  const debug = q.debug === '1';
  try {
    const [decp, permis] = await Promise.all([
      loadDecp(siren).catch(e => ({ items: [], total: 0, error: String(e && e.message || e) })),
      loadPermis(siren, depts, debug).catch(e => ({ configured: !!PERMISAPI_KEY, items: [], error: String(e && e.message || e) })),
    ]);
    return res.status(200).json({ siren, name, depts, decp, permis });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
