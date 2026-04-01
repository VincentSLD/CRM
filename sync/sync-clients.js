#!/usr/bin/env node
// ═══ Synchronisation des clients (sociétés) depuis Akuiteo ═══
const { sb, fetchAllPaginated, log } = require('./config');

async function syncClients() {
  log('=== SYNC CLIENTS ===');

  const akCustomers = await fetchAllPaginated('/crm/customers/search', { code: { operator: 'LIKE', value: '%' } });
  log(`${akCustomers.length} clients récupérés depuis Akuiteo`);

  const colors = ['#4f8ff7,#3b73d9','#8b5cf6,#7c3aed','#f59e0b,#d97706','#10b981,#059669','#ef4444,#dc2626','#06b6d4,#0891b2'];

  // Charger les clients existants pour ne pas écraser ini/color
  const { data: existingClients } = await sb.from('clients').select('id,akuiteo_id');
  const existingMap = {};
  (existingClients || []).forEach(c => { if (c.akuiteo_id) existingMap[c.akuiteo_id] = c; });

  let created = 0, updated = 0;
  const batch = akCustomers.map(ak => {
    const akId = String(ak.id || ak.code);
    const existing = existingMap[akId];
    const name = ak.name || ak.legalName || ak.code || 'Sans nom';
    const ini = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

    const row = {
      id: existing ? existing.id : 'ak_' + akId.replace(/[^a-zA-Z0-9]/g, '_'),
      name,
      code: ak.code || null,
      sector: ak.profession || ak.category || null,
      city: ak.address?.city || null,
      contact: ak.accountManager || ak.salesman || '',
      email: ak.address?.email || ak.email || '',
      phone: ak.address?.phone || ak.phone || '',
      akuiteo_id: akId,
      account_manager_id: ak.accountManagerId || null,
      last_contact: new Date().toISOString(),
      adresse_ligne1: ak.address?.line1 || null,
      adresse_ligne2: ak.address?.line2 || null,
      adresse_ligne3: ak.address?.line3 || null,
      code_postal: ak.address?.postalCode || null,
      pays: ak.address?.countryName || ak.address?.country || null,
      departement: ak.address?.geographicalDepartmentName || ak.address?.department || null,
      region: ak.address?.regionName || ak.address?.region || null,
      telephone2: ak.address?.phone2 || null,
      mobile: ak.address?.mobilePhone || null,
      fax: ak.address?.fax || null,
      site_web: ak.address?.webSite || null,
      raison_sociale: ak.legalName || null,
      raison_sociale2: ak.legalName2 || null,
      siren: ak.SIREN || null,
      siret: ak.SIRET || null,
      ape: ak.APE || null,
      forme_juridique: ak.legalForm || null,
      notes: ak.notes || null,
      chiffre_affaires: ak.revenue || null,
      capital: ak.equity || null,
      effectif: ak.headcount || null,
      categorie: ak.category || null,
      profession: ak.profession || null,
      secteur_activite: ak.activitySector || null,
      condition_paiement: ak.conditionOfPayment || null,
      mode_paiement: ak.methodOfPayment || null,
      reference_externe: ak.externalReference || null,
      statut_akuiteo: ak.status || null,
      langue: ak.languageCode || null,
      mots_cles: ak.keywords || null,
      code_societe: ak.companyCode || null,
    };

    if (!existing) {
      row.ini = ini || '??';
      row.color = colors[Math.floor(Math.random() * colors.length)];
      row.ca = 0; row.obj = 0; row.margin = 0; row.dso = 0;
      row.score = 50; row.status = 'objectif';
      row.sentiment_pos = 50; row.sentiment_neu = 35; row.sentiment_neg = 15;
      created++;
    } else {
      updated++;
    }
    return row;
  });

  for (let i = 0; i < batch.length; i += 100) {
    const { error } = await sb.from('clients').upsert(batch.slice(i, i + 100), { onConflict: 'id' });
    if (error) console.warn('  Upsert err:', error.message);
  }

  log(`Terminé: ${created} créés, ${updated} mis à jour`);
}

syncClients().catch(e => { console.error('ERREUR:', e); process.exit(1); });
