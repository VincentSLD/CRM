// ═══ Synchro nocturne — CATÉGORISATION ABC des clients ═══
// Port serveur fidèle de calculerCategoriesABC : ABC par agence (50/80 % du CA facturé 12 mois glissants,
// + rang), pseudo-agence GROUPE (toutes agences), et ABC par RÔLE (apporteur/architecte/gros-œuvre).
// Écrit categorie_compte(_rang) + categorie_apporteur/architecte/gros_oeuvre(_rang). Journalise dans sync_log.
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
  if (!_force) { try { const rows = await sbReq("app_config?select=value&key=eq.sync_jobs&limit=1"); const arr = rows && rows[0] && rows[0].value; if (Array.isArray(arr)) { const j = arr.find(x => x.key === 'abc'); if (j && j.actif === false) return res.status(200).json({ ok: true, skipped: true }); } } catch (e) {} }

  const t0 = Date.now();
  const out = { factures: 0, clients_maj: 0, agences: 0, erreurs_maj: 0, partial: false, errors: [] };
  try {
    const now = new Date();
    const cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);

    // Factures 12 mois glissants (une seule lecture, sert au CA client ET aux rôles)
    const factures = await sbFetchAll('factures', 'select=id,client_id,societe,montant,date,apporteur_affaire,architecte,gros_oeuvre&date=gte.' + cutoff + '&order=id.asc');
    const recent = factures.filter(f => f.client_id && f.societe && f.date);
    out.factures = recent.length;

    // ── ABC par agence (client facturé) ──
    const bySociete = {};
    for (const f of recent) { (bySociete[f.societe] = bySociete[f.societe] || {}); bySociete[f.societe][f.client_id] = (bySociete[f.societe][f.client_id] || 0) + Number(f.montant || 0); }
    const societes = Object.keys(bySociete).sort();
    out.agences = societes.length;
    const abcBySociete = {}, rangBySociete = {};
    for (const soc of societes) {
      const sorted = Object.entries(bySociete[soc]).map(([cid, ca]) => ({ cid, ca })).filter(x => x.ca > 0).sort((a, b) => b.ca - a.ca);
      const totalCA = sorted.reduce((s, x) => s + x.ca, 0); if (totalCA <= 0) continue;
      const t50 = totalCA * 0.5, t80 = totalCA * 0.8; let cumul = 0, rang = 0; const abcMap = {}, rangMap = {};
      for (const { cid, ca } of sorted) { rang++; rangMap[cid] = rang; cumul += ca; abcMap[cid] = cumul <= t50 ? 'A- Stratégique' : cumul <= t80 ? 'B- Tactique' : 'C- Listé'; }
      abcBySociete[soc] = abcMap; rangBySociete[soc] = rangMap;
    }
    const allClientIds = new Set();
    for (const soc of societes) if (abcBySociete[soc]) Object.keys(abcBySociete[soc]).forEach(cid => allClientIds.add(cid));
    const clientCategories = {}, clientRangs = {};
    for (const cid of allClientIds) {
      const catObj = {}, rangObj = {};
      for (const soc of societes) if (abcBySociete[soc] && abcBySociete[soc][cid]) { catObj[soc] = abcBySociete[soc][cid]; rangObj[soc] = rangBySociete[soc][cid]; }
      clientCategories[cid] = Object.keys(catObj).length ? catObj : null;
      clientRangs[cid] = Object.keys(rangObj).length ? rangObj : null;
    }
    // GROUPE (toutes agences)
    const groupCA = {};
    for (const soc of societes) for (const [cid, ca] of Object.entries(bySociete[soc])) groupCA[cid] = (groupCA[cid] || 0) + ca;
    const gSorted = Object.entries(groupCA).map(([cid, ca]) => ({ cid, ca })).filter(x => x.ca > 0).sort((a, b) => b.ca - a.ca);
    const gTotal = gSorted.reduce((s, x) => s + x.ca, 0);
    if (gTotal > 0) {
      const gt50 = gTotal * 0.5, gt80 = gTotal * 0.8; let gcum = 0, grg = 0;
      for (const { cid, ca } of gSorted) {
        grg++; gcum += ca; const cat = gcum <= gt50 ? 'A- Stratégique' : gcum <= gt80 ? 'B- Tactique' : 'C- Listé';
        if (!clientCategories[cid] || typeof clientCategories[cid] !== 'object') clientCategories[cid] = {};
        clientCategories[cid].GROUPE = cat;
        if (!clientRangs[cid] || typeof clientRangs[cid] !== 'object') clientRangs[cid] = {};
        clientRangs[cid].GROUPE = grg;
      }
    }
    // Clients ayant une catégorie mais plus de CA → null
    const existingCat = await sbFetchAll('clients', 'select=id&categorie_compte=not.is.null&order=id.asc');
    for (const row of existingCat) if (!allClientIds.has(row.id)) { clientCategories[row.id] = null; clientRangs[row.id] = null; }

    // ── ABC par RÔLE ──
    const nameIndex = {};
    { const cl = await sbFetchAll('clients', 'select=id,name&order=id.asc'); for (const c of cl) { const nn = _normApporteurName(c.name); if (nn) (nameIndex[nn] = nameIndex[nn] || []).push(c.id); } }
    const ROLES = [['apporteur', 'apporteur_affaire'], ['architecte', 'architecte'], ['gros_oeuvre', 'gros_oeuvre']];
    const roleCat = { apporteur: {}, architecte: {}, gros_oeuvre: {} };
    const roleRang = { apporteur: {}, architecte: {}, gros_oeuvre: {} };
    for (const [role, col] of ROLES) {
      const byAg = {};
      for (const f of recent) { const raw = _anClean(f[col]); if (!raw || !f.societe) continue; const nn = _normApporteurName(raw); (byAg[f.societe] = byAg[f.societe] || {}); byAg[f.societe][nn] = (byAg[f.societe][nn] || 0) + Number(f.montant || 0); }
      for (const ag of Object.keys(byAg)) {
        const sorted = Object.entries(byAg[ag]).map(([nn, ca]) => ({ nn, ca })).filter(x => x.ca > 0).sort((a, b) => b.ca - a.ca);
        const tot = sorted.reduce((s, x) => s + x.ca, 0); if (tot <= 0) continue;
        const t50 = tot * 0.5, t80 = tot * 0.8; let cum = 0, rg = 0;
        for (const { nn, ca } of sorted) { rg++; cum += ca; const cat = cum <= t50 ? 'A- Stratégique' : cum <= t80 ? 'B- Tactique' : 'C- Listé'; for (const cid of (nameIndex[nn] || [])) { (roleCat[role][cid] = roleCat[role][cid] || {})[ag] = cat; (roleRang[role][cid] = roleRang[role][cid] || {})[ag] = rg; } }
      }
    }

    // Ensemble des clients à mettre à jour (facturé + rôles + anciennes catégories de rôle à nettoyer)
    const idsToUpdate = new Set(Object.keys(clientCategories));
    for (const r of ['apporteur', 'architecte', 'gros_oeuvre']) Object.keys(roleCat[r]).forEach(id => idsToUpdate.add(id));
    const existingRole = await sbFetchAll('clients', 'select=id&or=(categorie_apporteur.not.is.null,categorie_architecte.not.is.null,categorie_gros_oeuvre.not.is.null)&order=id.asc');
    for (const row of existingRole) idsToUpdate.add(row.id);

    const clientIds = [...idsToUpdate];
    await mapLimit(clientIds, 8, async (cid) => {
      if (Date.now() - t0 > TIME_BUDGET_MS) { out.partial = true; return; }
      const upd = {};
      if (Object.prototype.hasOwnProperty.call(clientCategories, cid)) { upd.categorie_compte = clientCategories[cid]; upd.categorie_compte_rang = clientRangs[cid] || null; }
      upd.categorie_apporteur = roleCat.apporteur[cid] || null; upd.categorie_apporteur_rang = roleRang.apporteur[cid] || null;
      upd.categorie_architecte = roleCat.architecte[cid] || null; upd.categorie_architecte_rang = roleRang.architecte[cid] || null;
      upd.categorie_gros_oeuvre = roleCat.gros_oeuvre[cid] || null; upd.categorie_gros_oeuvre_rang = roleRang.gros_oeuvre[cid] || null;
      try { await sbUpdate(cid, upd); out.clients_maj++; } catch (e) { out.erreurs_maj++; }
    });

    const payload = { job: 'abc', ok: out.errors.length === 0 && !out.partial && out.erreurs_maj === 0, duration_ms: Date.now() - t0, detail: out, created_at: nowIso() };
    try { await sbReq('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) }); } catch (e) {}
    return res.status(200).json({ ok: true, ...out, duration_ms: Date.now() - t0 });
  } catch (e) {
    out.errors.push(e.message);
    try { await sbReq('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ job: 'abc', ok: false, duration_ms: Date.now() - t0, detail: out, created_at: nowIso() }) }); } catch (_) {}
    return res.status(500).json({ error: e.message, ...out });
  }
}
