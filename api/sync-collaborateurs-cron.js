// ═══ Synchro nocturne : Collaborateurs (Akuiteo + Lucca) + liaison auto + absences Lucca ═══
// Port serveur des fonctions client syncCollaborateurs / syncCollaborateursLucca / autoLinkLucca.
// Déclenché par Vercel Cron. Journalise le résultat dans la table sync_log.
// Env (Vercel) : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AKUITEO_BASE_URL, AKUITEO_USER, AKUITEO_PASS,
//                LUCCA_BASE_URL, LUCCA_API_KEY, CRON_SECRET (optionnel).
export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AK_ROOT = process.env.AKUITEO_BASE_URL || process.env.AKUITEO_URL;
const AK_USER = process.env.AKUITEO_USER, AK_PASS = process.env.AKUITEO_PASS;
const LUCCA_URL = process.env.LUCCA_BASE_URL, LUCCA_KEY = process.env.LUCCA_API_KEY;
const nowIso = () => new Date().toISOString();

async function sbReq(path, options = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}
async function sbUpsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 200) {
    await sbReq(table + '?on_conflict=' + onConflict, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 200)),
    });
  }
}
async function akuiteo(method, path, body) {
  const auth = Buffer.from(AK_USER + ':' + AK_PASS).toString('base64');
  const r = await fetch(AK_ROOT + path, {
    method,
    headers: { Authorization: 'Basic ' + auth, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error('Akuiteo ' + r.status + ': ' + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}
async function lucca(apiPath, params) {
  const qs = new URLSearchParams(params || {}).toString();
  const r = await fetch(LUCCA_URL + apiPath + (qs ? '?' + qs : ''), {
    headers: { Authorization: 'lucca application=' + LUCCA_KEY, Accept: 'application/json' },
  });
  const t = await r.text();
  if (!r.ok) throw new Error('Lucca ' + r.status + ': ' + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || '';
    if (auth !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });
  }
  if (!SB_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante' });
  // Interrupteur Actif/Inactif (page Admin « Synchronisations ») — ignoré si ?force=1 (lancement manuel)
  const _force = req.query && (req.query.force === '1');
  if (!_force) { try { const rows = await sbReq("app_config?select=value&key=eq.sync_jobs&limit=1"); const arr = rows && rows[0] && rows[0].value; if (Array.isArray(arr)) { const j = arr.find(x => x.key === 'collaborateurs'); if (j && j.actif === false) return res.status(200).json({ ok: true, skipped: true }); } } catch (e) {} }

  const t0 = Date.now();
  const result = { collaborateurs_akuiteo: 0, collaborateurs_lucca: 0, liaisons: 0, absences: 0, errors: [] };

  // 1) Collaborateurs Akuiteo → table collaborateurs
  if (AK_ROOT && AK_USER && AK_PASS) {
    try {
      const all = await akuiteo('POST', '/workforce/employees/search?limit=5000&offset=0', { code: { operator: 'LIKE', value: '%' } });
      const list = Array.isArray(all) ? all : [];
      const rows = list.map(e => ({
        id: 'emp_' + String(e.id).replace(/[^a-zA-Z0-9]/g, '_'), akuiteo_id: String(e.id), code: e.code || null,
        nom: e.name || '', prenom: e.firstName || null, titre: e.title || null, email: e.email || null,
        fonction: e.jobType || null, externe: e.external || false, generique: e.generic || false, cadre: e.executive || false,
      }));
      await sbUpsert('collaborateurs', rows, 'id');
      result.collaborateurs_akuiteo = rows.length;
    } catch (e) { result.errors.push('akuiteo: ' + e.message); }
  } else result.errors.push('akuiteo: variables env manquantes');

  // 2) Collaborateurs Lucca → table collaborateurs_lucca
  let luccaUsers = [];
  if (LUCCA_URL && LUCCA_KEY) {
    try {
      let page = 0;
      while (true) {
        const resp = await lucca('/api/v3/users', { fields: 'id,firstName,lastName,mail,department,legalEntity,dtContractStart,dtContractEnd,employeeNumber,jobTitle', paging: (page * 200) + ',200' });
        const items = (resp && resp.data && resp.data.items) || [];
        if (!items.length) break;
        luccaUsers = luccaUsers.concat(items);
        if (items.length < 200) break; page++;
      }
      const rows = luccaUsers.map(e => ({
        id: 'lucca_' + String(e.id), lucca_id: String(e.id), nom: e.lastName || '', prenom: e.firstName || null,
        email: e.mail || null, departement: (e.department && e.department.name) || null, etablissement: (e.legalEntity && e.legalEntity.name) || null,
        poste: e.jobTitle || null, numero_employe: e.employeeNumber || null, date_debut_contrat: e.dtContractStart || null,
        date_fin_contrat: e.dtContractEnd || null, updated_at: nowIso(),
      }));
      await sbUpsert('collaborateurs_lucca', rows, 'id');
      result.collaborateurs_lucca = rows.length;
    } catch (e) { result.errors.push('lucca users: ' + e.message); }
  } else result.errors.push('lucca: variables env manquantes');

  // 3) Liaison automatique Akuiteo ↔ Lucca (email, sinon nom+prénom)
  try {
    const aks = await sbReq('collaborateurs?select=id,nom,prenom,email,lucca_id');
    const lus = await sbReq('collaborateurs_lucca?select=lucca_id,nom,prenom,email');
    const byEmail = new Map(), byName = new Map();
    for (const l of (lus || [])) {
      if (l.email) byEmail.set(String(l.email).toLowerCase(), l.lucca_id);
      if (l.nom && l.prenom) byName.set((l.nom + '|' + l.prenom).toLowerCase(), l.lucca_id);
    }
    for (const ak of (aks || [])) {
      if (ak.lucca_id) continue;
      let lid = ak.email ? byEmail.get(String(ak.email).toLowerCase()) : null;
      if (!lid && ak.nom && ak.prenom) lid = byName.get((ak.nom + '|' + ak.prenom).toLowerCase());
      if (lid) {
        await sbReq('collaborateurs?id=eq.' + encodeURIComponent(ak.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ lucca_id: String(lid) }) });
        result.liaisons++;
      }
    }
  } catch (e) { result.errors.push('liaison: ' + e.message); }

  // 4) Absences Lucca (année en cours) → table absences_lucca. Budget temps ~235 s pour ne pas dépasser le timeout.
  if (LUCCA_URL && LUCCA_KEY && luccaUsers.length) {
    try {
      const ids = luccaUsers.map(e => String(e.id));
      const y = new Date().getFullYear();
      const yStart = y + '-01-01', yEnd = y + '-12-31';
      const BATCH = 50;
      for (let b = 0; b < ids.length; b += BATCH) {
        if (Date.now() - t0 > 235000) { result.errors.push('absences: arrêt budget temps à ' + b + '/' + ids.length); break; }
        const batch = ids.slice(b, b + BATCH);
        let leaves = [], lp = 0;
        while (true) {
          const resp = await lucca('/api/v3/leaves', { fields: 'id,date,isAm,leaveAccount,isActive,leavePeriod.ownerId', 'leavePeriod.ownerId': batch.join(','), date: 'between,' + yStart + ',' + yEnd, paging: (lp * 200) + ',200' });
          const items = (resp && resp.data && resp.data.items) || [];
          if (!items.length) break;
          leaves = leaves.concat(items);
          if (items.length < 200) break; lp++;
          await new Promise(r => setTimeout(r, 600));
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
          await sbUpsert('absences_lucca', absRows, 'id');
          result.absences += absRows.length;
        }
        await new Promise(r => setTimeout(r, 1200));
      }
    } catch (e) { result.errors.push('absences: ' + e.message); }
  }

  const payload = { job: 'collaborateurs', ok: result.errors.length === 0, duration_ms: Date.now() - t0, detail: result, created_at: nowIso() };
  try { await sbReq('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) }); } catch (e) {}
  return res.status(200).json({ ok: true, ...result, duration_ms: Date.now() - t0 });
}
