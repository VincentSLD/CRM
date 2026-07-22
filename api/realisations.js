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

// ─ PermisAPI : normalisation défensive (schéma exact non figé) ─
function normPermit(p) {
  const g = (...keys) => { for (const k of keys) { if (p && p[k] != null && p[k] !== '') return p[k]; } return ''; };
  return {
    num: g('num_pa', 'numero_permis', 'numero', 'num', 'id', 'reference'),
    date: String(g('date_reelle_autorisation', 'date_autorisation', 'date_decision', 'date_depot', 'date_reelle_depot', 'date')).slice(0, 10),
    type: g('type', 'nature_projet', 'nature', 'type_permis', 'type_dau', 'categorie'),
    surface: g('surface_reelle', 'surface_plancher', 'surface', 'shon', 'superficie'),
    logements: g('nb_logements', 'nb_lgt_tot', 'nb_lgt', 'logements'),
    petitionnaire: g('petitionnaire', 'demandeur', 'nom_petitionnaire', 'maitre_ouvrage', 'nom_demandeur', 'denomination'),
    commune: g('commune', 'nom_commune', 'ville', 'libelle_commune', 'commune_nom'),
    cp: g('code_postal', 'cp', 'code_insee', 'insee', 'comm'),
    adresse: g('adresse', 'adresse_terrain', 'localisation', 'libelle_adresse'),
    statut: g('statut', 'etat', 'decision', 'etat_dossier'),
  };
}
async function loadPermis(name, depts, debug) {
  if (!PERMISAPI_KEY) return { configured: false, items: [], error: null };
  const list = (depts || []).filter(Boolean).slice(0, 3);
  if (!list.length) return { configured: true, items: [], error: 'Aucun département fourni (renseignez le code postal / département de la fiche).' };
  const headers = { 'Authorization': 'Bearer ' + PERMISAPI_KEY, 'Accept': 'application/json' };
  const out = []; let error = null; let sampleKeys = null;
  for (const dep of list) {
    const url = PERMISAPI_BASE + '/permits?dep_code=' + encodeURIComponent(dep) + (name ? '&q=' + encodeURIComponent(name) : '');
    const r = await fetchJson(url, { headers });
    if (!r.ok) { error = 'PermisAPI ' + r.status + ': ' + String((r.data && (r.data.message || r.data.error)) || r.text).slice(0, 200); continue; }
    const arr = (r.data && (r.data.data || r.data.results || r.data.permits || r.data.items)) || (Array.isArray(r.data) ? r.data : []);
    if (arr && arr.length && !sampleKeys) sampleKeys = Object.keys(arr[0]);
    for (const p of arr) out.push(normPermit(p));
  }
  // Filtre par nom du pétitionnaire quand le champ est exploitable (sinon on garde tout)
  let items = out;
  if (name) {
    const tokens = name.toUpperCase().split(/[^A-Z0-9À-Ÿ]+/).filter(t => t.length >= 4);
    const filtered = out.filter(p => { const pet = String(p.petitionnaire || '').toUpperCase(); return pet && tokens.some(t => pet.includes(t)); });
    if (filtered.length) items = filtered;
  }
  return { configured: true, items: items.slice(0, 60), count: items.length, error, sampleKeys: debug ? sampleKeys : undefined };
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
      loadPermis(name, depts, debug).catch(e => ({ configured: !!PERMISAPI_KEY, items: [], error: String(e && e.message || e) })),
    ]);
    return res.status(200).json({ siren, name, depts, decp, permis });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
