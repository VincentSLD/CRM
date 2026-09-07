// ═══ Synchro nocturne Akuiteo — SOCIÉTÉS (incrémentale, dernier mois) ═══
// Port serveur fidèle de la 1re partie de syncAkuiteoQuick : sociétés modifiées/créées,
// adresses de facturation (sites), contacts, commerciaux associés, mode de paiement.
// Découpé par entité pour tenir sous la limite Vercel (300 s). Journalise dans sync_log.
// Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AKUITEO_BASE_URL/AKUITEO_USER/AKUITEO_PASS, CRON_SECRET (optionnel).
export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AK_ROOT = process.env.AKUITEO_BASE_URL || process.env.AKUITEO_URL;
const AK_USER = process.env.AKUITEO_USER, AK_PASS = process.env.AKUITEO_PASS;
const nowIso = () => new Date().toISOString();
const COLORS = ['#4f8ff7,#3b73d9', '#772471,#7c3aed', '#f59e0b,#d97706', '#10b981,#059669', '#ef4444,#dc2626'];
const TIME_BUDGET_MS = 255000; // marge sous 300 s

// ── Supabase REST ──
async function sbReq(path, options = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}
async function sbSelectAll(table, columns) {
  let out = [], from = 0; const step = 1000;
  while (true) {
    const rows = await sbReq(table + '?select=' + columns, { headers: { Range: from + '-' + (from + step - 1), 'Range-Unit': 'items' } });
    if (!Array.isArray(rows) || !rows.length) break;
    out = out.concat(rows);
    if (rows.length < step) break; from += step;
  }
  return out;
}
async function sbUpsert(table, rows, onConflict, chunk = 200) {
  for (let i = 0; i < rows.length; i += chunk) {
    await sbReq(table + '?on_conflict=' + onConflict, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + chunk)) });
  }
}
async function sbUpdate(table, id, cols) {
  if (!id || !Object.keys(cols).length) return;
  await sbReq(table + '?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(cols) });
}

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
  for (let a = 0; a < tries; a++) {
    try { return await akuiteo(method, path, body); }
    catch (e) { last = e; const m = e.message || ''; if (_akDown) throw e; if (/Akuiteo 4(00|01|03|04|22)/.test(m)) throw e; await new Promise(r => setTimeout(r, 500 * Math.pow(2, a))); }
  }
  throw last;
}
async function akSearchAll(path, criteria, pageSize = 500, maxPages = 30) {
  let all = [], off = 0;
  for (let p = 0; p < maxPages; p++) {
    if (_akDown) break;
    let batch;
    try { batch = await akRetry('POST', path + '?limit=' + pageSize + '&offset=' + off, criteria); }
    catch (e) { break; }
    if (!Array.isArray(batch) || !batch.length) break;
    all = all.concat(batch);
    if (batch.length < pageSize) break; off += pageSize;
  }
  return all;
}
async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) {} }
  });
  await Promise.all(workers);
}

// ── Référentiels Akuiteo (pour libeller mk_*) ──
async function loadRefs() {
  const [cats, subCats, proCats, sectors, linkTypes, pricing] = await Promise.all([
    akuiteo('POST', '/settings/categories/search?limit=200', { code: { operator: 'LIKE', value: '%' } }).catch(() => []),
    akuiteo('POST', '/settings/sub-categories/search?limit=500', { code: { operator: 'LIKE', value: '%' } }).catch(() => []),
    akuiteo('POST', '/settings/professional-categories/search?limit=100', {}).catch(() => []),
    akuiteo('POST', '/settings/sectors/search?limit=100', {}).catch(() => []),
    akuiteo('POST', '/settings/third-party-link-types/search?limit=100', {}).catch(() => []),
    akuiteo('POST', '/settings/pricing-methods/search?limit=100', {}).catch(() => []),
  ]);
  const toMap = (list, keyStr) => { const m = {}; for (const c of (list || [])) m[String(c.id)] = c.name || c.code || null; return m; };
  return {
    categories: toMap((cats || []).filter(c => c.type === 'CUSTOMER')),
    subCategories: toMap(subCats), proCats: toMap(proCats), sectors: toMap(sectors),
    linkTypes: toMap(linkTypes), pricing: toMap(pricing),
  };
}
const lbl = (map, id) => (id != null && map[String(id)]) ? map[String(id)] : null;

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    if ((req.headers.authorization || '') !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });
  }
  if (!SB_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante' });
  if (!AK_ROOT || !AK_USER || !AK_PASS) return res.status(500).json({ error: 'Variables Akuiteo manquantes' });

  const t0 = Date.now();
  const out = { societes: 0, billing: 0, contacts: 0, salesmen: 0, paiements: 0, partial: false, errors: [] };
  try {
    // Fenêtre = dernier mois (élargie si dernière sync plus ancienne)
    let cfg = null; try { const rows = await sbReq("crm_config?select=value&key=eq.last_sync_timestamp&limit=1"); cfg = rows && rows[0] ? rows[0].value : null; } catch (e) {}
    const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();
    const lastSync = (cfg && cfg < monthAgo) ? cfg : monthAgo;
    const syncStartedAt = nowIso();
    const sinceDate = lastSync.substring(0, 19) + '.000+0000';

    // 1) Sociétés modifiées OU créées
    const [modified, created] = await Promise.all([
      akSearchAll('/crm/customers/search', { modificationTime: { operator: 'GREATER_OR_EQUALS', value: sinceDate } }),
      akSearchAll('/crm/customers/search', { createdTime: { operator: 'GREATER_OR_EQUALS', value: sinceDate } }),
    ]);
    if (_akDown) { out.errors.push('Akuiteo en maintenance'); throw new Error('Akuiteo maintenance'); }
    const seen = new Set(); let akCustomers = [];
    for (const list of [created, modified]) { if (Array.isArray(list)) for (const c of list) { const id = String(c.id || c.code); if (!seen.has(id)) { seen.add(id); akCustomers.push(c); } } }

    // Exclusions + map des clients existants
    let excluded = new Set();
    try { const ex = await sbReq('sync_exclusions?select=akuiteo_id'); excluded = new Set((ex || []).map(r => r.akuiteo_id)); } catch (e) {}
    akCustomers = akCustomers.filter(ak => !excluded.has(String(ak.id || ak.code)));
    const existingClients = await sbSelectAll('clients', 'id,akuiteo_id');
    const existingMap = {}; for (const ec of existingClients) if (ec.akuiteo_id) existingMap[ec.akuiteo_id] = ec.id;

    if (akCustomers.length) {
      const refs = await loadRefs();
      const rows = akCustomers.map(ak => {
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
      });
      await sbUpsert('clients', rows, 'id');
      out.societes = rows.length;
      for (const ak of akCustomers) { const akId = String(ak.id || ak.code); if (!existingMap[akId]) existingMap[akId] = rows.find(r => r.akuiteo_id === akId).id; }

      // 2) Adresses de facturation via sites
      const akIds = akCustomers.map(ak => String(ak.id || ak.code));
      await mapLimit(akIds, 6, async (akId) => {
        if (Date.now() - t0 > TIME_BUDGET_MS) { out.partial = true; return; }
        let sites; try { sites = await akRetry('GET', '/crm/customers/' + akId + '/sites'); } catch (e) { return; }
        if (!Array.isArray(sites) || !sites.length) return;
        const bs = sites.find(s => s.useForBillingAddress) || sites.find(s => s.main) || sites[0];
        const a = bs && bs.address; if (!a) return;
        const crmId = existingMap[akId]; if (!crmId) return;
        await sbUpdate('clients', crmId, {
          fact_adresse_ligne1: a.line1 || null, fact_adresse_ligne2: a.line2 || null, fact_adresse_ligne3: a.line3 || null,
          fact_code_postal: a.postalCode || null, fact_ville: a.city || null,
          fact_pays: a.countryName || a.country || null, fact_departement: a.geographicalDepartmentName || a.department || null,
          fact_region: a.regionName || a.region || null, responsable_site_id: bs.managerId || null,
        });
        out.billing++;
      });

      // 3) Contacts + commerciaux associés + mode de paiement
      await mapLimit(akCustomers, 4, async (ak) => {
        if (Date.now() - t0 > TIME_BUDGET_MS) { out.partial = true; return; }
        const akId = String(ak.id || ak.code); const crmId = existingMap[akId]; if (!crmId) return;
        const [contacts, detail] = await Promise.all([
          akRetry('GET', '/crm/customers/' + akId + '/contacts').catch(() => []),
          akRetry('POST', '/crm/customers/' + akId + '/read', { options: ['SALESMEN', 'METHOD_OF_PAYMENT'] }).catch(() => null),
        ]);
        if (Array.isArray(contacts) && contacts.length) {
          const crows = contacts.map(ct => ({
            id: 'ct_' + String(ct.id).replace(/[^a-zA-Z0-9]/g, '_') + '_' + crmId.substring(0, 8),
            client_id: crmId, akuiteo_id: String(ct.id), akuiteo_customer_id: akId,
            nom: ct.name || '', prenom: ct.firstName || '', titre: ct.title || '',
            fonction: ct.position || ct.functionTitle || '', service: ct.service || '',
            email: ct.email || '', telephone: ct.phone || '', mobile: ct.mobilePhone || '',
          }));
          await sbUpsert('contacts', crows, 'id');
          out.contacts += crows.length;
        }
        if (detail && Array.isArray(detail.salesmen) && detail.salesmen.length) {
          const names = detail.salesmen.map(s => { const e = s.employee; return e ? ((e.name || '') + ' ' + (e.firstName || '')).trim() : s.employeeId; });
          await sbUpdate('clients', crmId, { commerciaux_associes: names.join(', ') }); out.salesmen++;
        }
        if (detail && detail.methodOfPayment) { await sbUpdate('clients', crmId, { mode_paiement: detail.methodOfPayment }); out.paiements++; }
      });
    }

    // 4) Mémoriser l'horodatage de sync (première entité du cycle)
    try { await sbReq('crm_config?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'last_sync_timestamp', value: syncStartedAt }) }); } catch (e) {}

    const payload = { job: 'akuiteo_societes', ok: out.errors.length === 0 && !out.partial, duration_ms: Date.now() - t0, detail: out, created_at: nowIso() };
    try { await sbReq('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) }); } catch (e) {}
    return res.status(200).json({ ok: true, ...out, duration_ms: Date.now() - t0 });
  } catch (e) {
    out.errors.push(e.message);
    try { await sbReq('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ job: 'akuiteo_societes', ok: false, duration_ms: Date.now() - t0, detail: out, created_at: nowIso() }) }); } catch (_) {}
    return res.status(500).json({ error: e.message, ...out });
  }
}
