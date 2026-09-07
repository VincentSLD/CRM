// ═══ Synchro nocturne Akuiteo — DOCUMENTS + MARCHÉS/AFFAIRES (incrémentale, dernier mois) ═══
// Port serveur fidèle de la section 3 de syncAkuiteoQuick : devis/commandes/factures du dernier mois,
// création des clients facturés manquants, enrichissement projets → marchés/affaires, puis documents liés,
// et conditions de paiement. Hiérarchie respectée (marchés/affaires AVANT docs pour garantir les liens).
// Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AKUITEO_BASE_URL/AKUITEO_USER/AKUITEO_PASS, CRON_SECRET (optionnel).
export const config = { maxDuration: 300 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AK_ROOT = process.env.AKUITEO_BASE_URL || process.env.AKUITEO_URL;
const AK_USER = process.env.AKUITEO_USER, AK_PASS = process.env.AKUITEO_PASS;
const nowIso = () => new Date().toISOString();
const TIME_BUDGET_MS = 255000;

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
async function sbUpdate(table, id, cols) { if (!id || !Object.keys(cols).length) return; await sbReq(table + '?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(cols) }); }

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
async function akSearchAll(path, criteria, pageSize = 500, maxPages = 30) {
  let all = [], off = 0;
  for (let p = 0; p < maxPages; p++) { if (_akDown) break; let b; try { b = await akRetry('POST', path + '?limit=' + pageSize + '&offset=' + off, criteria); } catch (e) { break; } if (!Array.isArray(b) || !b.length) break; all = all.concat(b); if (b.length < pageSize) break; off += pageSize; }
  return all;
}
async function mapLimit(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx], idx); } catch (e) {} } }));
}
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
  if (!AK_ROOT || !AK_USER || !AK_PASS) return res.status(500).json({ error: 'Variables Akuiteo manquantes' });
  const _force = req.query && (req.query.force === '1');
  if (!_force) { try { const rows = await sbReq("app_config?select=value&key=eq.sync_jobs&limit=1"); const arr = rows && rows[0] && rows[0].value; if (Array.isArray(arr)) { const j = arr.find(x => x.key === 'akuiteo_docs'); if (j && j.actif === false) return res.status(200).json({ ok: true, skipped: true }); } } catch (e) {} }

  const t0 = Date.now();
  const out = { devis: 0, commandes: 0, factures: 0, marches: 0, affaires: 0, clients_crees: 0, conditions: 0, partial: false, errors: [] };
  try {
    let cfg = null; try { const rows = await sbReq("crm_config?select=value&key=eq.last_sync_timestamp&limit=1"); cfg = rows && rows[0] ? rows[0].value : null; } catch (e) {}
    const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();
    const lastSync = (cfg && cfg < monthAgo) ? cfg : monthAgo;
    const sinceDay = lastSync.substring(0, 10);

    const existingClients = await sbSelectAll('clients', 'id,akuiteo_id,name');
    const existingMap = {}; const akCMap = {};
    for (const c of existingClients) { if (c.akuiteo_id) { existingMap[c.akuiteo_id] = c.id; akCMap[c.akuiteo_id] = c; } }

    // 3a. Documents du dernier mois
    const [rawQuot, rawOrd, rawInv] = await Promise.all([
      akSearchAll('/sales/quotations/search', { date: { operator: 'GREATER_OR_EQUALS', value: sinceDay } }),
      akSearchAll('/sales/orders/search', { date: { operator: 'GREATER_OR_EQUALS', value: sinceDay } }),
      akSearchAll('/sales/invoices/search', { date: { operator: 'GREATER_OR_EQUALS', value: sinceDay } }),
    ]);
    const recentQuot = Array.isArray(rawQuot) ? rawQuot : [], recentOrd = Array.isArray(rawOrd) ? rawOrd : [], recentInv = Array.isArray(rawInv) ? rawInv : [];
    if (_akDown) throw new Error('Akuiteo maintenance');

    // Détail des commandes (lignes + customData + description)
    if (recentOrd.length) {
      await mapLimit(recentOrd, 6, async o => { if (Date.now() - t0 > TIME_BUDGET_MS) { out.partial = true; return; } try { const full = await akRetry('GET', '/sales/orders/' + o.id); if (full) { o.lines = full.lines || []; o.description = full.description || o.description || null; o.customData = full.customData || o.customData || null; } } catch (e) { o.lines = o.lines || []; } });
    }

    // 3b. Collecte clients + projets référencés
    const neededProjects = new Map(); const refCustomerIds = new Set();
    const _collect = d => { const cid = String(d.thirdPartyId || d.customerId || ''); if (cid) refCustomerIds.add(cid); const pid = d.projectId || null; if (pid && !neededProjects.has(pid)) neededProjects.set(pid, { customerId: cid, agence: d.entityCode, date: d.date }); };
    recentQuot.forEach(_collect); recentOrd.forEach(_collect); recentInv.forEach(_collect);

    // 3c. Créer les clients facturés manquants (+ contacts)
    const missingCids = [...refCustomerIds].filter(cid => cid && !akCMap[cid]);
    if (missingCids.length) {
      const newClients = [], newContacts = [];
      await mapLimit(missingCids, 5, async cid => {
        if (Date.now() - t0 > TIME_BUDGET_MS) { out.partial = true; return; }
        let ak; try { ak = await akRetry('GET', '/crm/customers/' + cid); } catch (e) { return; }
        if (!ak || !(ak.id || ak.code)) return;
        const akId = String(ak.id || ak.code); const id = existingMap[akId] || ('ak_' + akId.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)); const isNew = !existingMap[akId];
        const ini = (ak.name || ak.legalName || '??').split(' ').map(w => (w || '')[0]).join('').substring(0, 2).toUpperCase(); const a = ak.address || {};
        newClients.push({ id, name: ak.name || ak.legalName || ak.code || 'Sans nom', code: ak.code || akId, akuiteo_id: akId, city: a.city || '', fact_ville: a.city || null, fact_code_postal: a.postalCode || null, account_manager_id: ak.accountManagerId || null, salesman_id: ak.salesmanId || null, raison_sociale: ak.legalName || null, siren: ak.SIREN || null, siret: ak.SIRET || null, ...(isNew ? { ini, ca: 0, obj: 0, margin: 0, dso: 0, score: 50, status: 'nouveau' } : {}) });
        akCMap[akId] = { id, akuiteo_id: akId, name: ak.name || ak.legalName || ak.code }; existingMap[akId] = id;
        try { const contacts = await akRetry('GET', '/crm/customers/' + akId + '/contacts'); if (Array.isArray(contacts)) for (const ct of contacts) newContacts.push({ id: 'ct_' + String(ct.id).replace(/[^a-zA-Z0-9]/g, '_') + '_' + id.substring(0, 8), client_id: id, akuiteo_id: String(ct.id), akuiteo_customer_id: akId, nom: ct.name || '', prenom: ct.firstName || '', titre: ct.title || '', fonction: ct.position || ct.functionTitle || '', service: ct.service || '', email: ct.email || '', telephone: ct.phone || '', mobile: ct.mobilePhone || '' }); } catch (e) {}
      });
      if (newClients.length) await sbUpsert('clients', newClients, 'id');
      if (newContacts.length) await sbUpsert('contacts', newContacts, 'id');
      out.clients_crees = newClients.length;
    }

    // 3d. Enrichir projets → marchés/affaires (AVANT docs)
    const enrich = {};
    if (neededProjects.size) {
      const existAff = new Set((await sbSelectAll('affaires', 'id')).map(a => a.id));
      const existMar = new Set((await sbSelectAll('marches', 'id')).map(m => m.id));
      const pidList = [...neededProjects.keys()];
      await mapLimit(pidList, 6, async pid => {
        if (Date.now() - t0 > TIME_BUDGET_MS) { out.partial = true; return; }
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
      out.marches = marcheRows.length; out.affaires = affaireRows.length;
    }

    // 3e. Documents liés
    const _docLink = pid => { if (!pid) return {}; const en = enrich[pid] || {}; return { affaire_id: _affaireIdOf(pid), marche_id: _marcheOf(pid).id, apporteur_affaire: en.apporteur || null, architecte: en.architecte || null }; };
    if (recentQuot.length) {
      const rows = recentQuot.map(q => { const c = akCMap[String(q.thirdPartyId || q.customerId || '')]; const pid = q.projectId || null; return { id: 'akd_' + String(q.id).replace(/[^a-zA-Z0-9.]/g, '_'), akuiteo_id: String(q.id || ''), ref: String(q.number || q.id || ''), client_name: (c && c.name) || q.name || 'Inconnu', client_id: (c && c.id) || null, sujet: q.name || 'Devis', montant: q.preTaxAmount || 0, montant_ttc: q.afterTaxAmount || 0, tva: (q.afterTaxAmount || 0) - (q.preTaxAmount || 0), statut: q.state === 'SIGNED' ? 'accepted' : q.state === 'ARCHIVED' ? 'refused' : 'pending', date: _d10(q.date) || new Date().toISOString().slice(0, 10), projet: pid, agence: q.entityCode || null, societe: q.companyCode || null, responsable_id: q.managerId || null, commercial_id: q.salesManagerId || null, devise: q.currencyCode || 'EUR', reference1: q.reference1 || null, probabilite: q.quotationProbability || null, date_validation: _d10(q.validationDate), date_signature_prevue: _d10(q.expectedSignatureDate), date_signature_reelle: _d10(q.actualSignatureDate), ..._docLink(pid) }; });
      await sbUpsert('devis', rows, 'id'); out.devis = rows.length;
    }
    if (recentOrd.length) {
      const rows = recentOrd.map(o => { const c = akCMap[String(o.thirdPartyId || o.customerId || '')]; const pid = o.projectId || null; const surface = Array.isArray(o.lines) ? o.lines.reduce((s, l) => s + Number(l.quantity || 0), 0) : null; const row = { id: 'akc_' + String(o.id).replace(/[^a-zA-Z0-9.]/g, '_'), akuiteo_id: String(o.id || ''), ref: String(o.number || o.id || ''), client_name: (c && c.name) || o.name || 'Inconnu', client_id: (c && c.id) || null, nom: o.name || 'Commande', montant: o.preTaxAmount || 0, montant_ttc: o.afterTaxAmount || 0, tva: (o.afterTaxAmount || 0) - (o.preTaxAmount || 0), statut: o.state === 'CLOSED' ? 'livree' : o.state === 'INVOICED' ? 'facturee' : o.state === 'CANCELLED' ? 'annulee' : 'en_cours', date: _d10(o.date) || new Date().toISOString().slice(0, 10), livraison: _d10(o.deliveryDate), projet: pid, agence: o.entityCode || null, societe: o.companyCode || null, responsable_id: o.managerId || null, commercial_id: o.salesManagerId || null, devise: o.currencyCode || 'EUR', reference1: o.reference1 || null, devis_origine: o.quotationId || null, date_client: _d10(o.customerDate), date_validation: _d10(o.validationDate), nb_lignes: Array.isArray(o.lines) ? o.lines.length : 0, surface_facturee: surface, description: o.description || null, custom_data: (o.customData && Object.keys(o.customData).length > 0) ? o.customData : null, ..._docCd(o.customData), ..._docLink(pid) }; if (!row.custom_data) delete row.custom_data; return row; });
      await sbUpsert('commandes', rows, 'id'); out.commandes = rows.length;
    }
    if (recentInv.length) {
      const rows = recentInv.map(f => { const c = akCMap[String(f.thirdPartyId || f.customerId || '')]; const pid = f.projectId || null; const isPaid = f.state === 'PAID' || f.state === 'CLOSED' || !!f.paidOn; return { id: 'akf_' + String(f.id).replace(/[^a-zA-Z0-9.]/g, '_'), akuiteo_id: String(f.id || ''), ref: String(f.number || f.id || ''), client_name: (c && c.name) || f.name || 'Inconnu', client_id: (c && c.id) || null, montant: f.preTaxAmount || 0, montant_ttc: f.afterTaxAmount || 0, tva: (f.afterTaxAmount || 0) - (f.preTaxAmount || 0), reste_a_payer: (f.balance != null ? f.balance : (isPaid ? 0 : (f.afterTaxAmount || 0))), statut: isPaid ? 'payee' : f.state === 'SENT' ? 'envoyee' : 'attente', date: _d10(f.date) || new Date().toISOString().slice(0, 10), echeance: _d10(f.dueDate) || _d10(f.payment && f.payment.dueDate), date_paiement: _d10(f.paidOn), date_comptable: _d10(f.bookedOn), projet: pid, agence: f.entityCode || null, societe: f.companyCode || null, responsable_id: f.managerId || null, type_facture: f.invoiceType || null, devise: f.currencyCode || 'EUR', ..._docLink(pid) }; });
      await sbUpsert('factures', rows, 'id'); out.factures = rows.length;
    }

    // 3f. Conditions de paiement (facture la plus récente par client)
    if (recentInv.length) {
      const latest = {}; for (const f of recentInv) { const cid = String(f.thirdPartyId || f.customerId || ''); if (!cid || !akCMap[cid]) continue; if (!latest[cid] || (f.date || '') > (latest[cid].date || '')) latest[cid] = f; }
      await mapLimit(Object.entries(latest), 6, async (pair) => { if (Date.now() - t0 > TIME_BUDGET_MS) { out.partial = true; return; } const cid = pair[0], f = pair[1]; try { const inv = await akRetry('POST', '/sales/invoices/' + f.id + '/read', { options: ['PAYMENT'] }); if (inv && inv.payment && inv.payment.code) { await sbUpdate('clients', akCMap[cid].id, { condition_paiement: inv.payment.code }); out.conditions++; } } catch (e) {} });
    }

    const payload = { job: 'akuiteo_docs', ok: out.errors.length === 0 && !out.partial && !_akDown, duration_ms: Date.now() - t0, detail: out, created_at: nowIso() };
    try { await sbReq('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) }); } catch (e) {}
    return res.status(200).json({ ok: true, ...out, duration_ms: Date.now() - t0 });
  } catch (e) {
    out.errors.push(e.message);
    try { await sbReq('sync_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ job: 'akuiteo_docs', ok: false, duration_ms: Date.now() - t0, detail: out, created_at: nowIso() }) }); } catch (_) {}
    return res.status(500).json({ error: e.message, ...out });
  }
}
