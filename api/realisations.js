// Enrichissement « Réalisations » d'un client (fiche client CRM) :
//   - Marchés publics gagnés → DECP (open data data.economie.gouv.fr, SANS clé)
//
// Appel : GET /api/realisations?siren=<9 chiffres>

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
  const select = [
    'datenotification', 'anneenotification', 'datepublicationdonnees', 'nomacheteur', 'codepostalacheteur', 'libellecommuneacheteur',
    'objetmarche', 'montant', 'natureobjetmarche', 'nature', 'procedure', 'formeprix', 'dureemois',
    'codecpv', 'referencecpv', 'lieuexecutionnom', 'codedepartementexecution',
    'denominationsociale_cotitulaire1', 'denominationsociale_cotitulaire2', 'denominationsociale_cotitulaire3',
  ].join(',');
  const url = DECP_URL + '?where=' + encodeURIComponent(where)
    + '&order_by=' + encodeURIComponent('datenotification desc')
    + '&limit=60&select=' + encodeURIComponent(select);
  const r = await fetchJson(url);
  if (!r.ok) return { items: [], total: 0, error: 'DECP ' + r.status + ': ' + String((r.data && r.data.message) || r.text).slice(0, 160) };
  const items = ((r.data && r.data.results) || []).map(x => ({
    date: String(x.datenotification || '').slice(0, 10),
    annee: x.anneenotification || '',
    publie: String(x.datepublicationdonnees || '').slice(0, 10),
    acheteur: x.nomacheteur || '',
    acheteurVille: [x.codepostalacheteur, x.libellecommuneacheteur].filter(Boolean).join(' '),
    objet: x.objetmarche || '',
    montant: (x.montant != null && x.montant !== '') ? Number(x.montant) : null,
    typeMarche: x.natureobjetmarche || '',      // Travaux / Fournitures / Services
    nature: x.nature || '',                     // Marché / Marché subséquent / Concession…
    procedure: x.procedure || '',
    formePrix: x.formeprix || '',
    duree: x.dureemois || null,
    cpv: x.codecpv || x.referencecpv || '',
    lieu: x.lieuexecutionnom || '',
    dept: x.codedepartementexecution || '',
    cotraitants: [x.denominationsociale_cotitulaire1, x.denominationsociale_cotitulaire2, x.denominationsociale_cotitulaire3].filter(Boolean),
  }));
  return { items, total: (r.data && r.data.total_count) != null ? r.data.total_count : items.length, error: null };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = req.query || {};
  const siren = String(q.siren || '').replace(/\D/g, '').slice(0, 9);
  try {
    const decp = await loadDecp(siren).catch(e => ({ items: [], total: 0, error: String(e && e.message || e) }));
    return res.status(200).json({ siren, decp });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
