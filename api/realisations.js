// Enrichissement « Réalisations » d'un client (fiche client CRM) :
//   - Marchés publics gagnés → DECP (open data data.economie.gouv.fr, SANS clé)
//
// Appel : GET /api/realisations?siren=<9 chiffres>

// Consolidé DECP officiel sur data.gouv (mise à jour QUOTIDIENNE, couvre 2024→aujourd'hui + historique),
// requêtable via l'API tabulaire de data.gouv. Remplace decp_augmente (data.economie) qui était figé à 2023.
const DECP_RESOURCE = '22847056-61df-452d-837d-8b8ceadbfc52'; // ressource decp.csv du dataset « DECP consolidées (format tabulaire) »
const DECP_TABULAR = 'https://tabular-api.data.gouv.fr/api/resources/' + DECP_RESOURCE + '/data/';

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

// ─ DECP : marchés publics où l'entreprise est titulaire (par SIREN), source consolidée fraîche ─
async function loadDecp(siren) {
  if (!siren) return { items: [], total: 0, error: null };
  const cols = 'dateNotification,acheteur_nom,acheteur_commune_nom,acheteur_departement_code,objet,montant,nature,procedure,formePrix,dureeMois,codeCPV,offresRecues,sousTraitanceDeclaree,titulaire_id,titulaire_nom';
  const url = DECP_TABULAR + '?titulaire_id__contains=' + encodeURIComponent(siren)
    + '&dateNotification__sort=desc&page_size=100&columns=' + encodeURIComponent(cols);
  const r = await fetchJson(url);
  if (!r.ok) return { items: [], total: 0, error: 'DECP ' + r.status + ': ' + String((r.data && (r.data.message || r.data.error)) || r.text).slice(0, 160) };
  const rows = (r.data && r.data.data) || [];
  const total = (r.data && r.data.meta && r.data.meta.total != null) ? r.data.meta.total : rows.length;
  const items = rows
    .filter(x => String(x.titulaire_id || '').replace(/\D/g, '').startsWith(siren)) // le SIREN doit être en tête du SIRET du titulaire
    .map(x => ({
      date: String(x.dateNotification || '').slice(0, 10),
      acheteur: x.acheteur_nom || '',
      acheteurVille: [x.acheteur_commune_nom, x.acheteur_departement_code].filter(Boolean).join(' · '),
      objet: x.objet || '',
      montant: (x.montant != null && x.montant !== '') ? Number(x.montant) : null,
      nature: x.nature || '',                 // Marché / Accord-cadre / Concession…
      procedure: x.procedure || '',
      formePrix: x.formePrix || '',
      duree: x.dureeMois || null,
      cpv: x.codeCPV || '',
      dept: x.acheteur_departement_code || '',
      offres: (x.offresRecues != null && x.offresRecues !== '') ? x.offresRecues : null,
      sousTraitance: x.sousTraitanceDeclaree || '',
      typeMarche: '', lieu: '', cotraitants: [],
    }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')) // plus récents d'abord (dates vides en dernier)
    .slice(0, 60);
  return { items, total, error: null };
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
