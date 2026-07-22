// Synchro DECP nocturne (par lots) : archive les marchés publics des clients dans decp_marches
// et pré-remplit départements + fourchette TCE (non destructif). Déclenché en boucle par GitHub Actions.
//
// Traite un LOT de clients (ceux jamais synchronisés ou synchronisés il y a > 7 j) par invocation
// (limite 60 s Vercel) ; le workflow rappelle l'endpoint jusqu'à « processed: 0 ».
//
// Env (Vercel) : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET (optionnel).

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DECP_RESOURCE = '22847056-61df-452d-837d-8b8ceadbfc52';
const DECP_TABULAR = 'https://tabular-api.data.gouv.fr/api/resources/' + DECP_RESOURCE + '/data/';
const BATCH = 30;

async function sbReq(path, options = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + txt.slice(0, 200));
  return txt ? JSON.parse(txt) : null;
}
async function fetchJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal }); const txt = await r.text(); let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) {} return { ok: r.ok, status: r.status, data, text: txt }; }
  catch (e) { return { ok: false, status: 0, data: null, text: String(e && e.message || e) }; }
  finally { clearTimeout(t); }
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
async function fetchDecp(siren, max = 500) {
  const PAGE = 100, seen = new Set(), out = [];
  for (let page = 1; page <= Math.ceil(max / PAGE) + 1 && out.length < max; page++) {
    const url = DECP_TABULAR + '?titulaire_id__contains=' + encodeURIComponent(siren) + '&donneesActuelles__exact=true&dateNotification__sort=desc&page_size=' + PAGE + '&page=' + page;
    const r = await fetchJson(url);
    if (!r.ok) break;
    const rows = (r.data && r.data.data) || [];
    for (const x of rows) {
      if (!String(x.titulaire_id || '').replace(/\D/g, '').startsWith(siren)) continue;
      const m = norm(x); if (!m.marche_id || seen.has(m.marche_id)) continue;
      seen.add(m.marche_id); out.push(m); if (out.length >= max) break;
    }
    if (rows.length < PAGE) break;
  }
  return out;
}
function pctl(arr, p) { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); const i = Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1)))); return a[i]; }

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    if ((req.headers['authorization'] || '') !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });
  }
  if (!KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY non configuré' });
  try {
    const cutoff = new Date(Date.now() - 7 * 864e5).toISOString();
    const clients = await sbReq('clients?select=id,siren,decp_synced_at,marche_profil&siren=not.is.null&or=(decp_synced_at.is.null,decp_synced_at.lt.' + encodeURIComponent(cutoff) + ')&order=decp_synced_at.asc.nullsfirst&limit=' + BATCH);
    let processed = 0, withMarches = 0, prefilled = 0, marchesArchives = 0;
    for (const c of (clients || [])) {
      const siren = String(c.siren || '').replace(/\D/g, '').slice(0, 9);
      const nowIso = new Date().toISOString();
      if (!/^\d{9}$/.test(siren)) {
        await sbReq('clients?id=eq.' + encodeURIComponent(c.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ decp_synced_at: nowIso, decp_count: 0 }) });
        processed++; continue;
      }
      let marches = []; try { marches = await fetchDecp(siren); } catch (e) {}
      if (marches.length) {
        const rows = marches.map(m => ({ ...m, client_id: c.id, siren, synced_at: nowIso }));
        for (let i = 0; i < rows.length; i += 500) {
          await sbReq('decp_marches', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)) });
        }
        withMarches++; marchesArchives += marches.length;
      }
      const upd = { decp_synced_at: nowIso, decp_count: marches.length };
      if (marches.length) {
        const p = c.marche_profil || {};
        const depts = [...new Set(marches.map(m => m.acheteur_dept).filter(Boolean))];
        const montants = marches.map(m => Number(m.montant)).filter(v => v > 0);
        const np = { ...p }; let changed = false;
        if ((!p.departements || !p.departements.length) && depts.length) { np.departements = depts; changed = true; }
        if (p.tce_min == null && p.tce_max == null && montants.length) { np.tce_min = Math.round(pctl(montants, 10)); np.tce_max = Math.round(pctl(montants, 90)); changed = true; }
        if (changed) { upd.marche_profil = np; prefilled++; }
      }
      await sbReq('clients?id=eq.' + encodeURIComponent(c.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(upd) });
      processed++;
    }
    return res.status(200).json({ ok: true, processed, withMarches, marchesArchives, prefilled, batch: BATCH });
  } catch (e) {
    console.error('decp-sync-cron:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
