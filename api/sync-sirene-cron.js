// ═══ Synchro nocturne — VEILLE SIRENE (radiations / état INSEE) ═══
// Rafraîchit l'état INSEE (radiation) des clients via l'API publique recherche-entreprises (gratuite),
// par CURSEUR : un lot par nuit (les moins récemment vérifiés d'abord), pour respecter le quota (~2 req/s)
// et le timeout Vercel. Met aussi à jour, si MANQUANTS seulement, raison sociale / APE / forme / TVA / siège.
// L'état INSEE (radiée) est TOUJOURS rafraîchi (c'est le but). Journalise dans sync_log.
// Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET (optionnel). (Aucune clé SIRENE : API ouverte.)
export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const nowIso = () => new Date().toISOString();
const TIME_BUDGET_MS = 250000;
const BATCH = 350;            // nb de clients traités par exécution (curseur)
const GAP_MS = 550;           // ~2 requêtes/seconde (limite SIRENE)

async function sbReq(path, options = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { ...options, headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}
async function sbUpdate(id, cols) { if (!id || !Object.keys(cols).length) return; await sbReq('clients?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(cols) }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function computeTVA(siren) { const s = String(siren || '').replace(/\D/g, ''); if (s.length !== 9) return null; const key = (12 + 3 * (Number(s) % 97)) % 97; return 'FR' + String(key).padStart(2, '0') + s; }
function siretValide(siret) { const s = String(siret || '').replace(/\s/g, ''); if (!/^\d{14}$/.test(s)) return false; let sum = 0; for (let i = 0; i < 14; i++) { let d = Number(s[i]); if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; } sum += d; } return sum % 10 === 0; }

let _next = 0;
async function fetchLegal(siret, attempt = 0) {
  if (!/^\d{14}$/.test(siret)) return null;
  const siren = siret.slice(0, 9);
  const now = Date.now(); const slot = Math.max(now, _next); _next = slot + GAP_MS; if (slot > now) await sleep(slot - now);
  let r; try { r = await fetch('https://recherche-entreprises.api.gouv.fr/search?q=' + siret + '&per_page=5&mtm_campaign=crm-novam'); } catch (e) { return null; }
  if (r.status === 429 && attempt < 4) { await sleep(1200 * (attempt + 1)); return fetchLegal(siret, attempt + 1); }
  if (!r.ok) return null;
  const d = await r.json().catch(() => null); if (!d) return null;
  const ent = (d.results || []).find(e => e.siren === siren) || (d.results || [])[0] || null;
  if (!ent) return null;
  const siege = ent.siege || {};
  const etab = (siege.siret === siret) ? { ...siege, est_siege: true } : ((ent.matching_etablissements || []).find(e => e.siret === siret) || null);
  const src = etab || siege;
  const etat = (etab && etab.etat_administratif) || siege.etat_administratif || 'A';
  return {
    raison_sociale: ent.nom_raison_sociale || ent.nom_complet || null,
    siren: ent.siren || null,
    ape: src.activite_principale || ent.activite_principale || null,
    forme_juridique: ent.nature_juridique || null,
    tva_intracommunautaire: computeTVA(ent.siren),
    est_siege: etab ? (etab.est_siege === true || etab.siret === siege.siret) : null,
    etat_insee: (etat === 'F' || etat === 'C') ? 'C' : 'A',
  };
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
  const _force = req.query && (req.query.force === '1');
  if (!_force) { try { const rows = await sbReq("app_config?select=value&key=eq.sync_jobs&limit=1"); const arr = rows && rows[0] && rows[0].value; if (Array.isArray(arr)) { const j = arr.find(x => x.key === 'sirene'); if (j && j.actif === false) return res.status(200).json({ ok: true, skipped: true }); } } catch (e) {} }

  const t0 = Date.now();
  const out = { traites: 0, radiations_detectees: 0, completes: 0, introuvables: 0, partial: false, errors: [] };
  try {
    // Curseur : les clients avec SIRET, les moins récemment vérifiés d'abord (jamais vérifiés en premier)
    const cols = 'id,siret,siren,raison_sociale,ape,forme_juridique,tva_intracommunautaire,est_siege,etat_insee,legal_checked_at';
    const clients = await sbReq('clients?select=' + cols + '&siret=not.is.null&siret=neq.&order=legal_checked_at.asc.nullsfirst&limit=' + BATCH);
    const todo = (clients || []).filter(c => siretValide(c.siret));
    const empty = v => v == null || v === '';
    for (const c of todo) {
      if (Date.now() - t0 > TIME_BUDGET_MS) { out.partial = true; out.errors.push('arrêt budget temps à ' + out.traites + '/' + todo.length); break; }
      out.traites++;
      let legal = null;
      try { legal = await fetchLegal(String(c.siret).replace(/\s/g, '')); } catch (e) { legal = null; }
      if (!legal) { out.introuvables++; try { await sbUpdate(c.id, { legal_checked_at: nowIso() }); } catch (e) {} continue; }
      const upd = { legal_checked_at: nowIso() };
      if (legal.etat_insee) { if (legal.etat_insee === 'C' && c.etat_insee !== 'C') out.radiations_detectees++; upd.etat_insee = legal.etat_insee; }
      if (empty(c.raison_sociale) && legal.raison_sociale) upd.raison_sociale = legal.raison_sociale;
      if (empty(c.siren) && legal.siren) upd.siren = legal.siren;
      if (empty(c.ape) && legal.ape) upd.ape = legal.ape;
      if (empty(c.forme_juridique) && legal.forme_juridique) upd.forme_juridique = legal.forme_juridique;
      if (empty(c.tva_intracommunautaire) && legal.tva_intracommunautaire) upd.tva_intracommunautaire = legal.tva_intracommunautaire;
      if (c.est_siege == null && legal.est_siege != null) upd.est_siege = legal.est_siege;
      if (Object.keys(upd).length > 1) out.completes++;
      try { await sbUpdate(c.id, upd); } catch (e) {}
    }
    const payload = { job: 'sirene', ok: out.errors.length === 0 && !out.partial, duration_ms: Date.now() - t0, detail: out, created_at: nowIso() };
    try { await sbReq('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) }); } catch (e) {}
    return res.status(200).json({ ok: true, ...out, duration_ms: Date.now() - t0 });
  } catch (e) {
    out.errors.push(e.message);
    try { await sbReq('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ job: 'sirene', ok: false, duration_ms: Date.now() - t0, detail: out, created_at: nowIso() }) }); } catch (_) {}
    return res.status(500).json({ error: e.message, ...out });
  }
}
