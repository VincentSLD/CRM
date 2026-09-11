// ═══ Synchro COMPLÈTE Akuiteo → CRM, resumable par curseur (pilotée en boucle par GitHub Actions) ═══
//
// Objectif : rapatrier TOUTES les données chaque nuit (comme une synchro complète), malgré la limite
// de 300 s par invocation Vercel. Chaque appel traite UN lot (≤ ~250 s) puis renvoie l'état de reprise :
//   { done:false, phase, cursor, ... }  → l'appelant (workflow GitHub) rappelle l'endpoint
//   { done:true }                       → cycle terminé
// L'état est persisté dans la table sync_state (key='akuiteo_full').
//
// Phases (machine à états, dans l'ordre) :
//   customers  → toutes les sociétés (offset), upsert base + mapping mk_*
//   enrich     → par société (keyset id) : adresse facturation (sites), contacts, commerciaux, mode de paiement
//   quotations → devis (offset) + projets→marchés/affaires + clients facturés manquants
//   orders     → commandes (offset) + détail (lignes/customData) + projets
//   invoices   → factures (offset) + projets + conditions de paiement
//   done
//
// Réglages via query : ?reset=1 (repart de zéro), ?enrich=0 (saute la phase enrich, plus rapide).
// Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AKUITEO_BASE_URL/AKUITEO_USER/AKUITEO_PASS, CRON_SECRET (optionnel).
export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AK_ROOT = process.env.AKUITEO_BASE_URL || process.env.AKUITEO_URL;
const AK_USER = process.env.AKUITEO_USER, AK_PASS = process.env.AKUITEO_PASS;
const nowIso = () => new Date().toISOString();
const TIME_BUDGET_MS = 250000;                    // marge sous 300 s
const COLORS = ['#4f8ff7,#3b73d9', '#772471,#7c3aed', '#f59e0b,#d97706', '#10b981,#059669', '#ef4444,#dc2626'];
const CUST_PAGE = 100;    // sociétés par lot (phase customers)
const ENRICH_PAGE = 60;   // sociétés enrichies par lot (phase enrich — 3 appels Akuiteo chacune)
const DOC_PAGE = 500;     // documents par lot (phases quotations/orders/invoices)
const STATE_KEY = 'akuiteo_full';
const FULL_CRIT = { companyCode: { operator: 'IS_NOT_NULL' } };

// ── Supabase REST ──
async function sbReq(path, options = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { ...options, headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}
async function sbSelectAll(table, columns, extra = '') {
  let out = [], from = 0; const step = 1000;
  while (true) {
    const rows = await sbReq(table + '?select=' + columns + (extra ? '&' + extra : ''), { headers: { Range: from + '-' + (from + step - 1), 'Range-Unit': 'items' } });
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
async function sbUpdate(table, id, cols) { if (!id || !Object.keys(cols).length) return; await sbReq(table + '?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(cols) }); }
async function getState() { try { const r = await sbReq('sync_state?select=value&key=eq.' + STATE_KEY + '&limit=1'); return (r && r[0]) ? r[0].value : null; } catch (e) { return null; } }
async function setState(v) { try { await sbReq('sync_state?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: STATE_KEY, value: v, updated_at: nowIso() }) }); } catch (e) {} }

// ── Akuiteo ──
let _akDown = false;
async function akuiteo(method, path, body) {
  if (_akDown) throw new Error('Akuiteo indisponible');
  const auth = Buffer.from(AK_USER + ':' + AK_PASS).toString('base64');
  const r = await fetch(AK_ROOT + path, { method, headers: { Authorization: 'Basic ' + auth, Accept: 'application/json', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) { if (/maintenance|mise à jour en cours/i.test(t)) _akDown = true; throw new Error('Akuiteo ' + r.status + ': ' + t.slice(0, 160)); }
  return t ? JSON.parse(t) : null;
}
async function akRetry(method, path, body, tries = 3) {
  let last = null;
  for (let a = 0; a < tries; a++) { try { return await akuiteo(method, path, body); } catch (e) { last = e; if (_akDown) throw e; if (/Akuiteo 4(00|01|03|04|22)/.test(e.message || '')) throw e; await new Promise(r => setTimeout(r, 500 * Math.pow(2, a))); } }
  throw last;
}
async function mapLimit(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) {} } }));
}

// ── Helpers de mapping (copiés fidèlement des crons incrémentaux) ──
const _d10 = v => v ? String(v).substring(0, 10) : null;
function _marcheOf(pid) {
  const parts = String(pid || '').split('.'); let code, keyParts;
  if (parts.length >= 3 && /^[A-Za-z]+$/.test(parts[0])) { code = parts.slice(1, 3).join('.'); keyParts = parts.slice(0, 3).join('.'); }
  else { code = parts.length >= 2 ? parts.slice(0, 2).join('.') : String(pid || ''); keyParts = code; }
  return { code, id: 'akm_' + keyParts.replace(/[^a-zA-Z0-9.]/g, '_') };
}
const _affaireIdOf = pid => 'aka_' + String(pid || '').replace(/[^a-zA-Z0-9.]/g, '_');
function _docCd(cd) {
  const out = {}; const g = k => (cd && cd[k] && cd[k].value != null && String(cd[k].value).trim()) ? String(cd[k].value).trim() : null;
  const tp = g('1-alpha06'); if (tp) out.type_prestation = tp;
  const go = g('1-alpha12'); if (go) out.gros_oeuvre = go;
  const ac = g('1-alpha09'); if (ac) out.apporteur_code = ac;
  const gc = g('1-alpha11'); if (gc) out.gros_oeuvre_code = gc;
  return out;
}
function _projGeoFromCd(cd) {
  const out = { lat: null, lng: null };
  if (!cd || typeof cd !== 'object') return out;
  for (const k in cd) { const v = cd[k]; if (!v || typeof v !== 'object' || !('value' in v)) continue; const nm = String(v.name || '').toLowerCase(); const n = Number(v.value); if (out.lat == null && nm.includes('latitude')) { if (v.value != null && v.value !== '' && isFinite(n)) out.lat = n; } else if (out.lng == null && nm.includes('longitude')) { if (v.value != null && v.value !== '' && isFinite(n)) out.lng = n; } }
  return out;
}
const lbl = (map, id) => (id != null && map[String(id)]) ? map[String(id)] : null;
async function loadRefs() {
  const [cats, subCats, proCats, sectors, linkTypes, pricing] = await Promise.all([
    akuiteo('POST', '/settings/categories/search?limit=200', { code: { operator: 'LIKE', value: '%' } }).catch(() => []),
    akuiteo('POST', '/settings/sub-categories/search?limit=500', { code: { operator: 'LIKE', value: '%' } }).catch(() => []),
    akuiteo('POST', '/settings/professional-categories/search?limit=100', {}).catch(() => []),
    akuiteo('POST', '/settings/sectors/search?limit=100', {}).catch(() => []),
    akuiteo('POST', '/settings/third-party-link-types/search?limit=100', {}).catch(() => []),
    akuiteo('POST', '/settings/pricing-methods/search?limit=100', {}).catch(() => []),
  ]);
  const toMap = (list) => { const m = {}; for (const c of (list || [])) m[String(c.id)] = c.name || c.code || null; return m; };
  return { categories: toMap((cats || []).filter(c => c.type === 'CUSTOMER')), subCategories: toMap(subCats), proCats: toMap(proCats), sectors: toMap(sectors), linkTypes: toMap(linkTypes), pricing: toMap(pricing) };
}
function mapCustomerRow(ak, refs, existingMap) {
  const akId = String(ak.id || ak.code);
  const id = existingMap[akId] || ('ak_' + akId.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20));
  const isNew = !existingMap[akId];
  const ini = (ak.name || ak.legalName || '??').split(' ').map(w => (w || '')[0]).join('').substring(0, 2).toUpperCase();
  const a = ak.address || {};
  return {
    id, name: ak.name || ak.legalName || ak.code || 'Sans nom', code: ak.code || akId,
    sector: ak.profession || ak.category || '', city: a.city || '',
    contact: ak.accountManager || ak.salesman || '', email: a.email || ak.email || '',
    phone: a.phone || ak.phone || '', akuiteo_id: akId,
    account_manager_id: ak.accountManagerId || null, salesman_id: ak.salesmanId || null,
    account_manager_name: ak.accountManager || null, salesman_name: ak.salesman || null,
    fact_adresse_ligne1: a.line1 || null, fact_adresse_ligne2: a.line2 || null, fact_adresse_ligne3: a.line3 || null,
    fact_code_postal: a.postalCode || null, fact_ville: a.city || null,
    fact_pays: a.countryName || null, fact_departement: a.geographicalDepartmentName || null, fact_region: a.regionName || null,
    raison_sociale: ak.legalName || null, siren: ak.SIREN || null, siret: ak.SIRET || null, ape: ak.APE || null, forme_juridique: ak.legalForm || null,
    mk_categorie_id: ak.categoryId || null, mk_categorie: lbl(refs.categories, ak.categoryId),
    mk_sous_categorie_id: ak.subCategoryId || null, mk_sous_categorie: lbl(refs.subCategories, ak.subCategoryId),
    mk_categorie_pro_id: ak.professionalCategoryId || null, mk_categorie_pro: lbl(refs.proCats, ak.professionalCategoryId),
    mk_secteur_id: ak.sectorId || null, mk_secteur: lbl(refs.sectors, ak.sectorId),
    mk_type_id: ak.thirdPartyLinkTypeId ? String(ak.thirdPartyLinkTypeId) : null, mk_type: ak.thirdPartyLinkTypeId ? lbl(refs.linkTypes, ak.thirdPartyLinkTypeId) : null,
    mk_groupe: ak.level1grouping || null, mk_origine: ak.level2grouping || null,
    mode_tarification: ak.firstPricingMethodId || null, mode_tarification_name: lbl(refs.pricing, ak.firstPricingMethodId),
    ...(isNew ? { ini, color: COLORS[Math.floor(Math.random() * COLORS.length)], ca: 0, obj: 0, margin: 0, dso: 0, score: 50, status: 'nouveau', sentiment_pos: 50, sentiment_neu: 35, sentiment_neg: 15 } : {}),
  };
}

async function log(out, ok) { try { await sbReq('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ job: 'akuiteo_full', ok, duration_ms: out.duration_ms, detail: out, created_at: nowIso() }) }); } catch (e) {} }

export default async function handler(req, res) {
  // Autorisation : boucle GitHub (Bearer CRON_SECRET) OU admin CRM connecté (jeton Supabase)
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || '';
    let okAuth = (auth === 'Bearer ' + process.env.CRON_SECRET);
    if (!okAuth && auth.startsWith('Bearer ')) {
      try { const u = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SB_KEY, Authorization: auth } }); if (u.ok) { const j = await u.json(); const em = ((j && j.email) || '').toLowerCase(); const admins = (process.env.ADMIN_EMAILS || 'vsalaud@be-gph.fr').toLowerCase().split(',').map(s => s.trim()); okAuth = !!em && admins.includes(em); } } catch (e) {}
    }
    if (!okAuth) return res.status(401).json({ error: 'unauthorized' });
  }
  if (!SB_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante' });
  if (!AK_ROOT || !AK_USER || !AK_PASS) return res.status(500).json({ error: 'Variables Akuiteo manquantes' });

  const t0 = Date.now();
  const skipEnrich = req.query && (req.query.enrich === '0');
  let st = (req.query && req.query.reset === '1') ? null : await getState();
  if (!st || !st.phase) st = { phase: 'customers', offset: 0, lastId: '' };

  const out = { phase: st.phase, offset: st.offset || 0, processed: 0, done: false, duration_ms: 0, errors: [] };
  try {
    // Map des clients existants (akuiteo_id → id CRM) — nécessaire à toutes les phases
    const existingClients = await sbSelectAll('clients', 'id,akuiteo_id,name');
    const existingMap = {}, akCMap = {};
    for (const c of existingClients) { if (c.akuiteo_id) { existingMap[c.akuiteo_id] = c.id; akCMap[c.akuiteo_id] = c; } }

    // ─── Phase 1 : SOCIÉTÉS (base) ───
    if (st.phase === 'customers') {
      let excluded = new Set();
      try { const ex = await sbReq('sync_exclusions?select=akuiteo_id'); excluded = new Set((ex || []).map(r => r.akuiteo_id)); } catch (e) {}
      const refs = await loadRefs();
      let offset = st.offset || 0;
      while (Date.now() - t0 < TIME_BUDGET_MS) {
        let batch; try { batch = await akRetry('POST', '/crm/customers/search?limit=' + CUST_PAGE + '&offset=' + offset, FULL_CRIT); } catch (e) { out.errors.push(e.message); break; }
        if (_akDown) { out.errors.push('Akuiteo maintenance'); break; }
        if (!Array.isArray(batch) || !batch.length) { st = { phase: skipEnrich ? 'quotations' : 'enrich', offset: 0, lastId: '' }; break; }
        const cust = batch.filter(ak => !excluded.has(String(ak.id || ak.code)));
        const rows = cust.map(ak => mapCustomerRow(ak, refs, existingMap));
        if (rows.length) await sbUpsert('clients', rows, 'id');
        for (const r of rows) if (r.akuiteo_id) existingMap[r.akuiteo_id] = r.id;
        out.processed += rows.length; offset += CUST_PAGE;
        if (batch.length < CUST_PAGE) { st = { phase: skipEnrich ? 'quotations' : 'enrich', offset: 0, lastId: '' }; break; }
        st = { phase: 'customers', offset };
      }
      out.offset = st.offset || 0;
    }

    // ─── Phase 2 : ENRICHISSEMENT par société (sites + contacts + commerciaux + mode de paiement) ───
    else if (st.phase === 'enrich') {
      // Parcours keyset des clients Akuiteo (par id CRM) pour reprise stable
      let lastId = st.lastId || '';
      let done = false;
      while (Date.now() - t0 < TIME_BUDGET_MS) {
        const page = await sbReq('clients?select=id,akuiteo_id&akuiteo_id=not.is.null' + (lastId ? '&id=gt.' + encodeURIComponent(lastId) : '') + '&order=id.asc&limit=' + ENRICH_PAGE);
        if (!Array.isArray(page) || !page.length) { done = true; break; }
        await mapLimit(page, 5, async (c) => {
          const akId = c.akuiteo_id, crmId = c.id; if (!akId || !crmId) return;
          // Adresse de facturation via sites
          try {
            const sites = await akRetry('GET', '/crm/customers/' + akId + '/sites');
            if (Array.isArray(sites) && sites.length) {
              const bs = sites.find(s => s.useForBillingAddress) || sites.find(s => s.main) || sites[0];
              const a = bs && bs.address;
              if (a) { await sbUpdate('clients', crmId, { fact_adresse_ligne1: a.line1 || null, fact_adresse_ligne2: a.line2 || null, fact_adresse_ligne3: a.line3 || null, fact_code_postal: a.postalCode || null, fact_ville: a.city || null, fact_pays: a.countryName || a.country || null, fact_departement: a.geographicalDepartmentName || a.department || null, fact_region: a.regionName || a.region || null, responsable_site_id: bs.managerId || null }); out.processed++; }
            }
          } catch (e) {}
          // Contacts + commerciaux associés + mode de paiement
          try {
            const [contacts, detail] = await Promise.all([
              akRetry('GET', '/crm/customers/' + akId + '/contacts').catch(() => []),
              akRetry('POST', '/crm/customers/' + akId + '/read', { options: ['SALESMEN', 'METHOD_OF_PAYMENT'] }).catch(() => null),
            ]);
            if (Array.isArray(contacts) && contacts.length) {
              const crows = contacts.map(ct => ({ id: 'ct_' + String(ct.id).replace(/[^a-zA-Z0-9]/g, '_') + '_' + crmId.substring(0, 8), client_id: crmId, akuiteo_id: String(ct.id), akuiteo_customer_id: akId, nom: ct.name || '', prenom: ct.firstName || '', titre: ct.title || '', fonction: ct.position || ct.functionTitle || '', service: ct.service || '', email: ct.email || '', telephone: ct.phone || '', mobile: ct.mobilePhone || '' }));
              await sbUpsert('contacts', crows, 'id');
            }
            if (detail && Array.isArray(detail.salesmen) && detail.salesmen.length) {
              const names = detail.salesmen.map(s => { const e = s.employee; return e ? ((e.name || '') + ' ' + (e.firstName || '')).trim() : s.employeeId; });
              await sbUpdate('clients', crmId, { commerciaux_associes: names.join(', ') });
            }
            if (detail && detail.methodOfPayment) await sbUpdate('clients', crmId, { mode_paiement: detail.methodOfPayment });
          } catch (e) {}
        });
        lastId = page[page.length - 1].id;
        st = { phase: 'enrich', lastId };
        if (page.length < ENRICH_PAGE) { done = true; break; }
      }
      if (done) st = { phase: 'quotations', offset: 0 };
      out.lastId = st.lastId || '';
    }

    // ─── Phases 3/4/5 : DOCUMENTS (devis / commandes / factures) + projets→marchés/affaires ───
    else if (st.phase === 'quotations' || st.phase === 'orders' || st.phase === 'invoices') {
      const phase = st.phase;
      const epMap = { quotations: '/sales/quotations/search', orders: '/sales/orders/search', invoices: '/sales/invoices/search' };
      let offset = st.offset || 0;
      const existAff = new Set((await sbSelectAll('affaires', 'id')).map(a => a.id));
      const existMar = new Set((await sbSelectAll('marches', 'id')).map(m => m.id));
      while (Date.now() - t0 < TIME_BUDGET_MS) {
        let batch; try { batch = await akRetry('POST', epMap[phase] + '?limit=' + DOC_PAGE + '&offset=' + offset, FULL_CRIT); } catch (e) { out.errors.push(e.message); break; }
        if (_akDown) { out.errors.push('Akuiteo maintenance'); break; }
        const nextPhase = phase === 'quotations' ? 'orders' : phase === 'orders' ? 'invoices' : 'done';
        if (!Array.isArray(batch) || !batch.length) { st = { phase: nextPhase, offset: 0 }; break; }
        await processDocPage(phase, batch, akCMap, existingMap, existAff, existMar, out);
        offset += DOC_PAGE; out.processed += batch.length;
        if (batch.length < DOC_PAGE) { st = { phase: nextPhase, offset: 0 }; break; }
        st = { phase, offset };
        if (Date.now() - t0 >= TIME_BUDGET_MS) break;
      }
      out.offset = st.offset || 0;
      out.phase = phase;
    }

    // ─── Fin de cycle ───
    if (st.phase === 'done') { out.done = true; st = { phase: 'customers', offset: 0, lastId: '', finishedAt: nowIso() }; }
    await setState(st);
    out.next = st.phase; out.duration_ms = Date.now() - t0;
    await log(out, out.errors.length === 0);
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    out.errors.push(e.message); out.duration_ms = Date.now() - t0;
    await log(out, false);
    return res.status(500).json({ error: e.message, ...out });
  }
}

// Traite une page de documents (devis/commandes/factures) : crée les clients facturés manquants,
// enrichit les projets → marchés/affaires, puis upsert les documents.
async function processDocPage(phase, docs, akCMap, existingMap, existAff, existMar, out) {
  // Détail des commandes (lignes + customData + description)
  if (phase === 'orders') {
    await mapLimit(docs, 6, async o => { try { const full = await akRetry('GET', '/sales/orders/' + o.id); if (full) { o.lines = full.lines || []; o.description = full.description || o.description || null; o.customData = full.customData || o.customData || null; } } catch (e) { o.lines = o.lines || []; } });
  }
  // Collecte clients + projets référencés
  const neededProjects = new Map(); const refCustomerIds = new Set();
  for (const d of docs) { const cid = String(d.thirdPartyId || d.customerId || ''); if (cid) refCustomerIds.add(cid); const pid = d.projectId || null; if (pid && !neededProjects.has(pid)) neededProjects.set(pid, { customerId: cid, agence: d.entityCode, date: d.date }); }

  // Créer les clients facturés manquants (+ contacts)
  const missingCids = [...refCustomerIds].filter(cid => cid && !akCMap[cid]);
  if (missingCids.length) {
    const newClients = [], newContacts = [];
    await mapLimit(missingCids, 5, async cid => {
      let ak; try { ak = await akRetry('GET', '/crm/customers/' + cid); } catch (e) { return; }
      if (!ak || !(ak.id || ak.code)) return;
      const akId = String(ak.id || ak.code); const id = existingMap[akId] || ('ak_' + akId.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)); const isNew = !existingMap[akId];
      const ini = (ak.name || ak.legalName || '??').split(' ').map(w => (w || '')[0]).join('').substring(0, 2).toUpperCase(); const a = ak.address || {};
      newClients.push({ id, name: ak.name || ak.legalName || ak.code || 'Sans nom', code: ak.code || akId, akuiteo_id: akId, city: a.city || '', fact_ville: a.city || null, fact_code_postal: a.postalCode || null, account_manager_id: ak.accountManagerId || null, salesman_id: ak.salesmanId || null, account_manager_name: ak.accountManager || null, salesman_name: ak.salesman || null, raison_sociale: ak.legalName || null, siren: ak.SIREN || null, siret: ak.SIRET || null, ...(isNew ? { ini, ca: 0, obj: 0, margin: 0, dso: 0, score: 50, status: 'nouveau' } : {}) });
      akCMap[akId] = { id, akuiteo_id: akId, name: ak.name || ak.legalName || ak.code }; existingMap[akId] = id;
      try { const contacts = await akRetry('GET', '/crm/customers/' + akId + '/contacts'); if (Array.isArray(contacts)) for (const ct of contacts) newContacts.push({ id: 'ct_' + String(ct.id).replace(/[^a-zA-Z0-9]/g, '_') + '_' + id.substring(0, 8), client_id: id, akuiteo_id: String(ct.id), akuiteo_customer_id: akId, nom: ct.name || '', prenom: ct.firstName || '', titre: ct.title || '', fonction: ct.position || ct.functionTitle || '', service: ct.service || '', email: ct.email || '', telephone: ct.phone || '', mobile: ct.mobilePhone || '' }); } catch (e) {}
    });
    if (newClients.length) await sbUpsert('clients', newClients, 'id');
    if (newContacts.length) await sbUpsert('contacts', newContacts, 'id');
  }

  // Enrichir projets → marchés/affaires (AVANT docs)
  const enrich = {};
  if (neededProjects.size) {
    const pidList = [...neededProjects.keys()];
    await mapLimit(pidList, 6, async pid => {
      try { const proj = await akRetry('POST', '/projectmanagement/projects/' + pid + '/read', { options: ['PROJECT_SUB_CATEGORY', 'PROJECT_SUB_CATEGORY_LEVEL2', 'MANAGER', 'ADDRESS', 'CUSTOM_DATA', 'PROJECT_GROUP'] }); if (proj) { const a = proj.address || null; const g = _projGeoFromCd(proj.customData); enrich[pid] = { name: proj.name || null, marcheNom: (proj.projectGroup && proj.projectGroup.name) || null, apporteur: (proj.projectSubCategoryLevel2 && proj.projectSubCategoryLevel2.name) || null, architecte: (proj.projectSubCategory && proj.projectSubCategory.name) || null, responsable: proj.manager ? [proj.manager.name, proj.manager.firstName].filter(Boolean).join(' ') : null, adresse: a ? a.line1 : null, ville: a ? a.city : null, code_postal: a ? a.postalCode : null, lat: g.lat, lng: g.lng }; } } catch (e) {}
    });
    const marchesMap = {}, affaireRows = [];
    for (const pid of pidList) {
      const en = enrich[pid] || {}; const nb = neededProjects.get(pid) || {}; const crmClient = akCMap[String(nb.customerId || '')];
      const { code: marcheCode, id: marcheId } = _marcheOf(pid); const pCreated = _d10(nb.date) || new Date().toISOString().slice(0, 10);
      if (!marchesMap[marcheId]) marchesMap[marcheId] = { id: marcheId, akuiteo_id: marcheCode, ref: marcheCode, nom: en.marcheNom || en.name || ('Marché ' + marcheCode), client_id: (crmClient && crmClient.id) || null, client_name: (crmClient && crmClient.name) || '', agence: nb.agence || '', statut: 'en_cours', nb_affaires: 0, date_debut: pCreated, adresse: en.adresse || null, code_postal: en.code_postal || null, ville: en.ville || null, _recent: !!en.name };
      if (en.marcheNom && marchesMap[marcheId].nom !== en.marcheNom) marchesMap[marcheId].nom = en.marcheNom;
      marchesMap[marcheId].nb_affaires++;
      if (marchesMap[marcheId].lat == null && en.lat != null && en.lng != null) { marchesMap[marcheId].lat = en.lat; marchesMap[marcheId].lng = en.lng; }
      const affId = _affaireIdOf(pid);
      if (enrich[pid] || !existAff.has(affId)) affaireRows.push({ id: affId, akuiteo_id: pid, ref: pid, nom: en.name || ('Affaire ' + pid), marche_id: marcheId, client_id: (crmClient && crmClient.id) || null, client_name: (crmClient && crmClient.name) || '', agence: nb.agence || '', statut: 'en_cours', code_projet: pid, date_debut: pCreated, apporteur_affaire: en.apporteur || null, architecte: en.architecte || null, responsable: en.responsable || null, adresse: en.adresse || null, ville: en.ville || null, code_postal: en.code_postal || null });
    }
    const marcheRows = Object.values(marchesMap).filter(m => m._recent || !existMar.has(m.id)).map(m => { const { _recent, ...row } = m; return row; });
    if (marcheRows.length) await sbUpsert('marches', marcheRows, 'id');
    if (affaireRows.length) await sbUpsert('affaires', affaireRows, 'id');
    for (const m of marcheRows) existMar.add(m.id);
    for (const a of affaireRows) existAff.add(a.id);
  }

  // Documents liés
  const _docLink = pid => { if (!pid) return {}; const en = enrich[pid] || {}; return { affaire_id: _affaireIdOf(pid), marche_id: _marcheOf(pid).id, apporteur_affaire: en.apporteur || null, architecte: en.architecte || null }; };
  if (phase === 'quotations') {
    const rows = docs.map(q => { const c = akCMap[String(q.thirdPartyId || q.customerId || '')]; const pid = q.projectId || null; return { id: 'akd_' + String(q.id).replace(/[^a-zA-Z0-9.]/g, '_'), akuiteo_id: String(q.id || ''), ref: String(q.number || q.id || ''), client_name: (c && c.name) || q.name || 'Inconnu', client_id: (c && c.id) || null, sujet: q.name || 'Devis', montant: q.preTaxAmount || 0, montant_ttc: q.afterTaxAmount || 0, tva: (q.afterTaxAmount || 0) - (q.preTaxAmount || 0), statut: q.state === 'SIGNED' ? 'accepted' : q.state === 'ARCHIVED' ? 'refused' : 'pending', date: _d10(q.date) || new Date().toISOString().slice(0, 10), projet: pid, agence: q.entityCode || null, societe: q.companyCode || null, responsable_id: q.managerId || null, commercial_id: q.salesManagerId || null, devise: q.currencyCode || 'EUR', reference1: q.reference1 || null, probabilite: q.quotationProbability || null, date_validation: _d10(q.validationDate), date_signature_prevue: _d10(q.expectedSignatureDate), date_signature_reelle: _d10(q.actualSignatureDate), ..._docLink(pid) }; });
    await sbUpsert('devis', rows, 'id'); out.devis = (out.devis || 0) + rows.length;
  } else if (phase === 'orders') {
    const rows = docs.map(o => { const c = akCMap[String(o.thirdPartyId || o.customerId || '')]; const pid = o.projectId || null; const surface = Array.isArray(o.lines) ? o.lines.reduce((s, l) => s + Number(l.quantity || 0), 0) : null; const row = { id: 'akc_' + String(o.id).replace(/[^a-zA-Z0-9.]/g, '_'), akuiteo_id: String(o.id || ''), ref: String(o.number || o.id || ''), client_name: (c && c.name) || o.name || 'Inconnu', client_id: (c && c.id) || null, nom: o.name || 'Commande', montant: o.preTaxAmount || 0, montant_ttc: o.afterTaxAmount || 0, tva: (o.afterTaxAmount || 0) - (o.preTaxAmount || 0), statut: o.state === 'CLOSED' ? 'livree' : o.state === 'INVOICED' ? 'facturee' : o.state === 'CANCELLED' ? 'annulee' : 'en_cours', date: _d10(o.date) || new Date().toISOString().slice(0, 10), livraison: _d10(o.deliveryDate), projet: pid, agence: o.entityCode || null, societe: o.companyCode || null, responsable_id: o.managerId || null, commercial_id: o.salesManagerId || null, devise: o.currencyCode || 'EUR', reference1: o.reference1 || null, devis_origine: o.quotationId || null, date_client: _d10(o.customerDate), date_validation: _d10(o.validationDate), nb_lignes: Array.isArray(o.lines) ? o.lines.length : 0, surface_facturee: surface, description: o.description || null, custom_data: (o.customData && Object.keys(o.customData).length > 0) ? o.customData : null, ..._docCd(o.customData), ..._docLink(pid) }; if (!row.custom_data) delete row.custom_data; return row; });
    await sbUpsert('commandes', rows, 'id'); out.commandes = (out.commandes || 0) + rows.length;
  } else if (phase === 'invoices') {
    const rows = docs.map(f => { const c = akCMap[String(f.thirdPartyId || f.customerId || '')]; const pid = f.projectId || null; const isPaid = f.state === 'PAID' || f.state === 'CLOSED' || !!f.paidOn; return { id: 'akf_' + String(f.id).replace(/[^a-zA-Z0-9.]/g, '_'), akuiteo_id: String(f.id || ''), ref: String(f.number || f.id || ''), client_name: (c && c.name) || f.name || 'Inconnu', client_id: (c && c.id) || null, montant: f.preTaxAmount || 0, montant_ttc: f.afterTaxAmount || 0, tva: (f.afterTaxAmount || 0) - (f.preTaxAmount || 0), reste_a_payer: (f.balance != null ? f.balance : (isPaid ? 0 : (f.afterTaxAmount || 0))), statut: isPaid ? 'payee' : f.state === 'SENT' ? 'envoyee' : 'attente', date: _d10(f.date) || new Date().toISOString().slice(0, 10), echeance: _d10(f.dueDate) || _d10(f.payment && f.payment.dueDate), date_paiement: _d10(f.paidOn), date_comptable: _d10(f.bookedOn), projet: pid, agence: f.entityCode || null, societe: f.companyCode || null, responsable_id: f.managerId || null, type_facture: f.invoiceType || null, devise: f.currencyCode || 'EUR', ..._docLink(pid) }; });
    await sbUpsert('factures', rows, 'id'); out.factures = (out.factures || 0) + rows.length;
  }
}
