// Tous les marchés publics DECP (versions courantes) d'un SIREN — pour archivage/analyse.
// Appel : GET /api/decp-client?siren=<9 chiffres>[&max=500]
// Source : consolidé DECP data.gouv (API tabulaire), sans clé.

const DECP_RESOURCE = '22847056-61df-452d-837d-8b8ceadbfc52';
const DECP_TABULAR = 'https://tabular-api.data.gouv.fr/api/resources/' + DECP_RESOURCE + '/data/';

async function fetchJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl.signal });
    const txt = await r.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) {}
    return { ok: r.ok, status: r.status, data, text: txt };
  } catch (e) {
    return { ok: false, status: 0, data: null, text: String(e && e.message || e) };
  } finally { clearTimeout(t); }
}

function norm(x) {
  return {
    marche_id: x.id != null ? String(x.id) : '',
    date_notification: String(x.dateNotification || '').slice(0, 10) || null,
    acheteur_nom: x.acheteur_nom || null,
    acheteur_dept: x.acheteur_departement_code || null,
    objet: x.objet || null,
    montant: (x.montant != null && x.montant !== '') ? Number(x.montant) : null,
    cpv: x.codeCPV || null,
    nature: x.nature || null,
    procedure: x.procedure || null,
    forme_prix: x.formePrix || null,
    duree_mois: (x.dureeMois != null && x.dureeMois !== '' && !isNaN(Number(x.dureeMois))) ? Math.round(Number(x.dureeMois)) : null,
    groupement: x.typeGroupementOperateurs || null,
    titulaire_nom: x.titulaire_nom || null,
    raw: x,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const siren = String((req.query && req.query.siren) || '').replace(/\D/g, '').slice(0, 9);
  if (siren.length < 9) return res.status(400).json({ error: 'siren invalide' });
  const max = Math.min(Math.max(parseInt((req.query && req.query.max) || '500', 10) || 500, 50), 1000);
  const PAGE = 100;
  const seen = new Set();
  const marches = [];
  let total = 0, error = null;
  try {
    for (let page = 1; page <= Math.ceil(max / PAGE) + 1 && marches.length < max; page++) {
      const url = DECP_TABULAR + '?titulaire_id__contains=' + encodeURIComponent(siren)
        + '&donneesActuelles__exact=true&dateNotification__sort=desc&page_size=' + PAGE + '&page=' + page;
      const r = await fetchJson(url);
      if (!r.ok) { error = 'DECP ' + r.status + ': ' + String((r.data && (r.data.message || r.data.error)) || r.text).slice(0, 160); break; }
      const rows = (r.data && r.data.data) || [];
      if (r.data && r.data.meta && r.data.meta.total != null) total = r.data.meta.total;
      for (const x of rows) {
        if (!String(x.titulaire_id || '').replace(/\D/g, '').startsWith(siren)) continue;
        const m = norm(x);
        if (!m.marche_id || seen.has(m.marche_id)) continue;
        seen.add(m.marche_id); marches.push(m);
        if (marches.length >= max) break;
      }
      if (rows.length < PAGE) break;
    }
  } catch (e) { error = String(e && e.message || e); }
  return res.status(200).json({ siren, total, count: marches.length, marches, error });
}
