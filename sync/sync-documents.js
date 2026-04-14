#!/usr/bin/env node
// ═══ Synchronisation des devis, commandes, factures depuis Akuiteo ═══
const { sb, fetchAllPaginated, log } = require('./config');

const bulkCrit = { companyCode: { operator: 'IS_NOT_NULL', value: '' } };

async function syncDocuments() {
  log('=== SYNC DOCUMENTS (devis, commandes, factures) ===');

  // Charger la map clients akuiteo_id → CRM
  let allClients = [], from = 0;
  while (true) {
    const { data } = await sb.from('clients').select('id,name,akuiteo_id').range(from, from + 999);
    if (!data || data.length === 0) break;
    allClients = allClients.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const akClientMap = {};
  allClients.filter(c => c.akuiteo_id).forEach(c => { akClientMap[c.akuiteo_id] = c; });
  log(`${Object.keys(akClientMap).length} clients mappés`);

  // Fetch tout en parallèle
  log('Récupération des documents Akuiteo...');
  const [allQuotations, allOrders, allInvoices] = await Promise.all([
    fetchAllPaginated('/sales/quotations/search', bulkCrit),
    fetchAllPaginated('/sales/orders/search', bulkCrit),
    fetchAllPaginated('/sales/invoices/search', bulkCrit),
  ]);
  log(`${allQuotations.length} devis, ${allOrders.length} commandes, ${allInvoices.length} factures`);

  // --- Devis ---
  log('Traitement des devis...');
  const dBatch = allQuotations.map(q => {
    const akCid = String(q.thirdPartyId || q.customerId || '');
    const crmClient = akClientMap[akCid];
    const row = {
      id: 'akd_' + String(q.id).replace(/[^a-zA-Z0-9.]/g, '_'),
      akuiteo_id: String(q.id || ''),
      ref: String(q.number || q.id || ''),
      client_name: crmClient?.name || q.name || 'Inconnu',
      client_id: crmClient?.id || null,
      sujet: q.name || q.description || q.projectId || 'Devis Akuiteo',
      montant: q.preTaxAmount || 0,
      montant_ttc: q.afterTaxAmount || 0,
      tva: (q.afterTaxAmount || 0) - (q.preTaxAmount || 0),
      statut: q.state === 'SIGNED' ? 'accepted' : q.state === 'ARCHIVED' ? 'refused' : q.state === 'SENT' ? 'sent' : 'pending',
      date: q.date ? q.date.substring(0, 10) : new Date().toISOString().slice(0, 10),
      projet: q.projectId || null,
      agence: q.entityCode || null,
      societe: q.companyCode || null,
      responsable_id: q.managerId || null,
      commercial_id: q.salesManagerId || null,
      reference1: q.reference1 || null,
      devise: q.currencyCode || 'EUR',
      probabilite: q.quotationProbability || null,
      description: q.description || null,
      date_validation: q.validationDate ? q.validationDate.substring(0, 10) : null,
      date_signature_prevue: q.expectedSignatureDate ? q.expectedSignatureDate.substring(0, 10) : null,
      date_signature_reelle: q.actualSignatureDate ? q.actualSignatureDate.substring(0, 10) : null,
      nb_lignes: Array.isArray(q.lines) ? q.lines.length : 0,
      marche_id: null, affaire_id: null,
      custom_data: (q.customData && Object.keys(q.customData).length > 0) ? q.customData : null,
    };
    // Don't overwrite custom_data if null — preserve existing value in Supabase
    if (!row.custom_data) delete row.custom_data;
    return row;
  });
  for (let i = 0; i < dBatch.length; i += 100) {
    const { error } = await sb.from('devis').upsert(dBatch.slice(i, i + 100), { onConflict: 'id' });
    if (error) console.warn('  Devis upsert err:', error.message);
  }
  log(`${dBatch.length} devis enregistrés`);

  // --- Commandes ---
  log('Traitement des commandes...');
  const cBatch = allOrders.map(o => {
    const akCid = String(o.thirdPartyId || o.customerId || '');
    const crmClient = akClientMap[akCid];
    const row = {
      id: 'akc_' + String(o.id).replace(/[^a-zA-Z0-9.]/g, '_'),
      akuiteo_id: String(o.id || ''),
      ref: String(o.number || o.id || ''),
      client_name: crmClient?.name || o.name || 'Inconnu',
      client_id: crmClient?.id || null,
      nom: o.name || null,
      montant: o.preTaxAmount || 0,
      montant_ttc: o.afterTaxAmount || 0,
      tva: (o.afterTaxAmount || 0) - (o.preTaxAmount || 0),
      statut: o.state === 'DELIVERED' ? 'livree' : o.state === 'CANCELLED' ? 'annulee' : 'en_cours',
      date: o.date ? o.date.substring(0, 10) : new Date().toISOString().slice(0, 10),
      livraison: o.deliveryDate ? o.deliveryDate.substring(0, 10) : null,
      projet: o.projectId || null,
      agence: o.entityCode || null,
      societe: o.companyCode || null,
      description: o.description || null,
      reference1: o.reference1 || null,
      devis_origine: o.quotationId || null,
      responsable_id: o.managerId || null,
      commercial_id: o.salesManagerId || null,
      date_client: o.customerDate ? o.customerDate.substring(0, 10) : null,
      date_validation: o.validationDate ? o.validationDate.substring(0, 10) : null,
      devise: o.currencyCode || 'EUR',
      nb_lignes: Array.isArray(o.lines) ? o.lines.length : 0,
      marche_id: null, affaire_id: null,
      custom_data: (o.customData && Object.keys(o.customData).length > 0) ? o.customData : null,
    };
    // Don't overwrite custom_data if null — preserve existing value in Supabase
    if (!row.custom_data) delete row.custom_data;
    return row;
  });
  for (let i = 0; i < cBatch.length; i += 100) {
    const { error } = await sb.from('commandes').upsert(cBatch.slice(i, i + 100), { onConflict: 'id' });
    if (error) console.warn('  Commandes upsert err:', error.message);
  }
  log(`${cBatch.length} commandes enregistrées`);

  // --- Factures ---
  log('Traitement des factures...');
  const fBatch = allInvoices.map(f => {
    const akCid = String(f.thirdPartyId || f.customerId || '');
    const crmClient = akClientMap[akCid];
    const row = {
      id: 'akf_' + String(f.id).replace(/[^a-zA-Z0-9.]/g, '_'),
      akuiteo_id: String(f.id || ''),
      ref: String(f.number || f.id || ''),
      client_name: crmClient?.name || 'Inconnu',
      client_id: crmClient?.id || null,
      montant: f.preTaxAmount || 0,
      montant_ttc: f.afterTaxAmount || 0,
      tva: (f.afterTaxAmount || 0) - (f.preTaxAmount || 0),
      statut: f.paidOn ? 'payee' : f.bookedOn ? 'envoyee' : 'brouillon',
      date: f.date ? f.date.substring(0, 10) : new Date().toISOString().slice(0, 10),
      echeance: f.payment?.dueDate ? f.payment.dueDate.substring(0, 10) : null,
      jours_retard: 0,
      type_facture: f.invoiceType || null,
      reste_a_payer: f.balance || 0,
      description: f.description || null,
      projet: f.projectId || null,
      agence: f.entityCode || null,
      societe: f.companyCode || null,
      mode_paiement: f.methodOfPayment || null,
      date_envoi: f.sentOn ? f.sentOn.substring(0, 10) : null,
      date_paiement: f.paidOn ? f.paidOn.substring(0, 10) : null,
      date_comptable: f.bookedOn ? f.bookedOn.substring(0, 10) : null,
      statut_dematerialisation: f.dematerializationStatus || null,
      responsable_id: f.managerId || null,
      devise: f.currencyCode || 'EUR',
      nb_lignes: Array.isArray(f.lines) ? f.lines.length : 0,
      reference1: f.reference1 || null,
      marche_id: null, affaire_id: null,
      custom_data: (f.customData && Object.keys(f.customData).length > 0) ? f.customData : null,
    };
    // Don't overwrite custom_data if null — preserve existing value in Supabase
    if (!row.custom_data) delete row.custom_data;
    return row;
  });
  for (let i = 0; i < fBatch.length; i += 100) {
    const { error } = await sb.from('factures').upsert(fBatch.slice(i, i + 100), { onConflict: 'id' });
    if (error) console.warn('  Factures upsert err:', error.message);
  }
  log(`${fBatch.length} factures enregistrées`);

  log('=== SYNC DOCUMENTS TERMINÉE ===');
}

syncDocuments().catch(e => { console.error('ERREUR:', e); process.exit(1); });
