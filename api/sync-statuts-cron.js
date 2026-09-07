// ═══ Synchro nocturne — STATUTS clients (Prospect / Nouveau / Actif / Dormant) ═══
// Port serveur fidèle de calculerStatutsClients : activité (commandes/factures directes + rôles
// apporteur/architecte/gros-œuvre via l'index nom), seuil 6 mois. Met à jour uniquement les changements.
// Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET (optionnel).
export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const nowIso = () => new Date().toISOString();
const TIME_BUDGET_MS = 270000;
const _AN_NOISE = ['AUCUN', 'TIERS INCONNU', 'A COMPLETER', 'INDEFINI', 'INDÉFINI', 'NON RENSEIGN'];
const _anClean = v => { if (!v) return ''; const s = String(v).trim(); const up = s.toUpperCase(); if (!s || _AN_NOISE.some(n => up.includes(n))) return ''; return s; };
const _normApporteurName = s => (s || '').toString().trim().toUpperCase().replace(/\s+/g, ' ');

async function sbReq(path, options = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { ...options, headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}
async function sbFetchAll(table, query) {
  let out = [], from = 0; const step = 1000;
  while (true) {
    const rows = await sbReq(table + '?' + query, { headers: { Range: from + '-' + (from + step - 1), 'Range-Unit': 'items' } });
    if (!Array.isArray(rows) || !rows.length) break; out = out.concat(rows);
    if (rows.length < step) break; from += step;
  }
  return out;
}
async function sbUpdate(id, cols) { await sbReq('clients?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(cols) }); }
async function mapLimit(items, limit, fn) { let i = 0; await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx]); } catch (e) {} } })); }

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || '';
    let okAuth = (auth === 'Bearer ' + process.env.CRON_SECRET);
    if (!okAuth && auth.startsWith('Bearer ')) {
      try { const u = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SB_KEY, Authorization: auth } }); if (u.ok) { const j = await u.json(); const em = ((j && j.email) || '').toLowerCase(); const admins = (process.env.ADMIN_EMAILS || 'vsalaud@be-gph.fr').toLowerCase().split(',').map(s => s.trim()); okAuth = !!em && admins.includes(em); } } catch (e) {}
    }
    if (!okAuth) return res.status(401).json({ error: 'unauthorized' });
  }
  if (!SB_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante' });
  const _force = req.query && (req.query.force === '1');
  if (!_force) { try { const rows = await sbReq("app_config?select=value&key=eq.sync_jobs&limit=1"); const arr = rows && rows[0] && rows[0].value; if (Array.isArray(arr)) { const j = arr.find(x => x.key === 'statuts'); if (j && j.actif === false) return res.status(200).json({ ok: true, skipped: true }); } } catch (e) {} }

  const t0 = Date.now();
  const out = { prospect: 0, actif: 0, nouveau: 0, dormant: 0, changements: 0, clients_maj: 0, erreurs_maj: 0, partial: false, errors: [] };
  try {
    // Clients (statut + nom pour l'index des rôles), factures et commandes (avec colonnes de rôle)
    const clients = await sbFetchAll('clients', 'select=id,name,status&order=id.asc');
    const factures = await sbFetchAll('factures', 'select=client_id,date,apporteur_affaire,architecte,gros_oeuvre&order=id.asc');
    const commandes = await sbFetchAll('commandes', 'select=client_id,date,apporteur_affaire,architecte,gros_oeuvre&order=id.asc');

    const nameIndex = {};
    for (const c of clients) { const nn = _normApporteurName(c.name); if (nn) (nameIndex[nn] = nameIndex[nn] || []).push(c.id); }

    const act = {};
    const addAct = (cid, date, kind) => {
      if (!cid) return;
      if (!act[cid]) act[cid] = { min: null, max: null, hasCmd: false, hasFac: false, hasRole: false };
      const a = act[cid];
      if (date) { if (!a.min || date < a.min) a.min = date; if (!a.max || date > a.max) a.max = date; }
      if (kind === 'cmd') a.hasCmd = true; else if (kind === 'fac') a.hasFac = true; else a.hasRole = true;
    };
    for (const f of factures) addAct(f.client_id, f.date, 'fac');
    for (const o of commandes) addAct(o.client_id, o.date, 'cmd');
    const ROLE_COLS = ['apporteur_affaire', 'architecte', 'gros_oeuvre'];
    const addRoles = (rows) => { for (const r of rows) for (const col of ROLE_COLS) { const raw = _anClean(r[col]); if (!raw) continue; const nn = _normApporteurName(raw); for (const cid of (nameIndex[nn] || [])) addAct(cid, r.date, 'role'); } };
    addRoles(factures); addRoles(commandes);

    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()).toISOString().slice(0, 10);
    const statusFor = (cid) => {
      const a = act[cid];
      if (!a || (!a.hasCmd && !a.hasFac && !a.hasRole) || !a.max) return 'prospect';
      if (a.max >= sixMonthsAgo) {
        if (!a.hasCmd && !a.hasFac && a.hasRole) return 'actif';
        return (a.min && a.min >= sixMonthsAgo) ? 'nouveau' : 'actif';
      }
      return 'dormant';
    };

    const changes = [];
    for (const c of clients) {
      const ns = statusFor(c.id);
      if (ns === 'prospect') out.prospect++; else if (ns === 'nouveau') out.nouveau++; else if (ns === 'actif') out.actif++; else out.dormant++;
      if ((c.status || '') !== ns) changes.push({ id: c.id, status: ns });
    }
    out.changements = changes.length;

    await mapLimit(changes, 8, async (ch) => {
      if (Date.now() - t0 > TIME_BUDGET_MS) { out.partial = true; return; }
      try { await sbUpdate(ch.id, { status: ch.status }); out.clients_maj++; } catch (e) { out.erreurs_maj++; }
    });

    const payload = { job: 'statuts', ok: out.errors.length === 0 && !out.partial && out.erreurs_maj === 0, duration_ms: Date.now() - t0, detail: out, created_at: nowIso() };
    try { await sbReq('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) }); } catch (e) {}
    return res.status(200).json({ ok: true, ...out, duration_ms: Date.now() - t0 });
  } catch (e) {
    out.errors.push(e.message);
    try { await sbReq('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ job: 'statuts', ok: false, duration_ms: Date.now() - t0, detail: out, created_at: nowIso() }) }); } catch (_) {}
    return res.status(500).json({ error: e.message, ...out });
  }
}
