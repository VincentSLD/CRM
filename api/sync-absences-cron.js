// ═══ Synchro nocturne — ABSENCES Lucca (année en cours) ═══
// Séparée de la synchro collaborateurs (partie lente, soumise au rate limit Lucca 429).
// Lit les identifiants Lucca dans collaborateurs_lucca (déjà peuplée par sync-collaborateurs-cron),
// puis récupère les absences par lots avec backoff sur 429 et résilience par lot (⚠️ Partiel si un lot échoue).
// Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LUCCA_BASE_URL, LUCCA_API_KEY, CRON_SECRET (optionnel).
export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LUCCA_URL = process.env.LUCCA_BASE_URL, LUCCA_KEY = process.env.LUCCA_API_KEY;
const nowIso = () => new Date().toISOString();
const TIME_BUDGET_MS = 250000;

async function sbReq(path, options = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { ...options, headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}
async function sbSelectAll(table, columns) {
  let out = [], from = 0; const step = 1000;
  while (true) {
    const rows = await sbReq(table + '?select=' + columns, { headers: { Range: from + '-' + (from + step - 1), 'Range-Unit': 'items' } });
    if (!Array.isArray(rows) || !rows.length) break; out = out.concat(rows);
    if (rows.length < step) break; from += step;
  }
  return out;
}
async function sbUpsert(table, rows, onConflict, chunk = 200) {
  for (let i = 0; i < rows.length; i += chunk) {
    await sbReq(table + '?on_conflict=' + onConflict, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + chunk)) });
  }
}
async function lucca(apiPath, params, tries = 5) {
  const qs = new URLSearchParams(params || {}).toString();
  const url = LUCCA_URL + apiPath + (qs ? '?' + qs : '');
  let last = null;
  for (let a = 0; a < tries; a++) {
    const r = await fetch(url, { headers: { Authorization: 'lucca application=' + LUCCA_KEY, Accept: 'application/json' } });
    if (r.status === 429) { const ra = Number(r.headers.get('retry-after')); const waitMs = Math.min((Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1500 * Math.pow(2, a)), 30000); last = new Error('Lucca 429 (rate limit)'); await new Promise(res => setTimeout(res, waitMs)); continue; }
    const t = await r.text();
    if (!r.ok) throw new Error('Lucca ' + r.status + ': ' + t.slice(0, 160));
    return t ? JSON.parse(t) : null;
  }
  throw last || new Error('Lucca 429 (retries épuisés)');
}

export default async function handler(req, res) {
  // Autorisation : Vercel Cron (Bearer CRON_SECRET) OU admin CRM connecté (jeton Supabase) pour un lancement manuel
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || '';
    let okAuth = (auth === 'Bearer ' + process.env.CRON_SECRET);
    if (!okAuth && auth.startsWith('Bearer ')) {
      try { const u = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SB_KEY, Authorization: auth } }); if (u.ok) { const j = await u.json(); const em = ((j && j.email) || '').toLowerCase(); const admins = (process.env.ADMIN_EMAILS || 'vsalaud@be-gph.fr').toLowerCase().split(',').map(s => s.trim()); okAuth = !!em && admins.includes(em); } } catch (e) {}
    }
    if (!okAuth) return res.status(401).json({ error: 'unauthorized' });
  }
  if (!SB_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante' });
  if (!LUCCA_URL || !LUCCA_KEY) return res.status(500).json({ error: 'Variables Lucca manquantes' });
  const _force = req.query && (req.query.force === '1');
  if (!_force) { try { const rows = await sbReq("app_config?select=value&key=eq.sync_jobs&limit=1"); const arr = rows && rows[0] && rows[0].value; if (Array.isArray(arr)) { const j = arr.find(x => x.key === 'absences'); if (j && j.actif === false) return res.status(200).json({ ok: true, skipped: true }); } } catch (e) {} }

  const t0 = Date.now();
  const out = { absences: 0, lots: 0, lots_echec: 0, collaborateurs: 0, partial: false, errors: [] };
  try {
    // Identifiants Lucca depuis la table (peuplée par la synchro collaborateurs)
    const collabs = await sbSelectAll('collaborateurs_lucca', 'lucca_id');
    const ids = [...new Set((collabs || []).map(c => c.lucca_id).filter(Boolean).map(String))];
    out.collaborateurs = ids.length;
    if (!ids.length) { out.errors.push('Aucun identifiant Lucca (lancez d\'abord la synchro Collaborateurs)'); }

    const y = new Date().getFullYear();
    const yStart = y + '-01-01', yEnd = y + '-12-31';
    const BATCH = 40;
    for (let b = 0; b < ids.length; b += BATCH) {
      if (Date.now() - t0 > TIME_BUDGET_MS) { out.partial = true; out.errors.push('arrêt budget temps à ' + b + '/' + ids.length); break; }
      const batch = ids.slice(b, b + BATCH); out.lots++;
      try {
        let leaves = [], lp = 0;
        while (true) {
          const resp = await lucca('/api/v3/leaves', { fields: 'id,date,isAm,leaveAccount,isActive,leavePeriod.ownerId', 'leavePeriod.ownerId': batch.join(','), date: 'between,' + yStart + ',' + yEnd, paging: (lp * 200) + ',200' });
          const items = (resp && resp.data && resp.data.items) || [];
          if (!items.length) break;
          leaves = leaves.concat(items);
          if (items.length < 200) break; lp++;
          await new Promise(r => setTimeout(r, 900));
        }
        if (leaves.length) {
          const absRows = leaves.map(l => {
            let period = 'unknown';
            if (l.isAm === true) period = 'AM'; else if (l.isAm === false) period = 'PM';
            else if (typeof l.id === 'string') { if (l.id.endsWith('-AM')) period = 'AM'; else if (l.id.endsWith('-PM')) period = 'PM'; }
            let d = l.date || null;
            if (!d && typeof l.id === 'string') { const m = l.id.match(/(\d{4})(\d{2})(\d{2})/); if (m) d = m[1] + '-' + m[2] + '-' + m[3]; }
            const owner = (l.leavePeriod && (l.leavePeriod.ownerId || (l.leavePeriod.owner && l.leavePeriod.owner.id))) || null;
            return { id: String(l.id), lucca_id: owner ? String(owner) : null, date_absence: d, periode: period, type_absence: (l.leaveAccount && l.leaveAccount.name) || 'Autre', actif: l.isActive !== false, updated_at: nowIso() };
          }).filter(r => r.lucca_id);
          if (absRows.length) { await sbUpsert('absences_lucca', absRows, 'id'); out.absences += absRows.length; }
        }
      } catch (e) { out.lots_echec++; out.partial = true; }
      await new Promise(r => setTimeout(r, 1500));
    }
    if (out.lots_echec) out.errors.push(out.lots_echec + ' lot(s) en échec (rate limit Lucca) — relancer plus tard');

    const payload = { job: 'absences', ok: out.errors.length === 0 && !out.partial, duration_ms: Date.now() - t0, detail: out, created_at: nowIso() };
    try { await sbReq('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) }); } catch (e) {}
    return res.status(200).json({ ok: true, ...out, duration_ms: Date.now() - t0 });
  } catch (e) {
    out.errors.push(e.message);
    try { await sbReq('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ job: 'absences', ok: false, duration_ms: Date.now() - t0, detail: out, created_at: nowIso() }) }); } catch (_) {}
    return res.status(500).json({ error: e.message, ...out });
  }
}
