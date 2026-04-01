#!/usr/bin/env node
// ═══ Synchronisation des contacts depuis Akuiteo ═══
const { sb, akuiteoFetch, log } = require('./config');

const BATCH_PARALLEL = 10;

async function syncContacts() {
  log('=== SYNC CONTACTS ===');

  // Charger tous les clients CRM avec akuiteo_id
  let allClients = [], from = 0;
  while (true) {
    const { data } = await sb.from('clients').select('id,akuiteo_id').range(from, from + 999);
    if (!data || data.length === 0) break;
    allClients = allClients.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const clientMap = {};
  allClients.filter(c => c.akuiteo_id).forEach(c => { clientMap[c.akuiteo_id] = c; });
  const akIds = Object.keys(clientMap);
  log(`${akIds.length} clients avec akuiteo_id`);

  let synced = 0, errors = 0, skipped = 0;

  for (let i = 0; i < akIds.length; i += BATCH_PARALLEL) {
    const chunk = akIds.slice(i, i + BATCH_PARALLEL);
    await Promise.all(chunk.map(async akCid => {
      const crmClient = clientMap[akCid];
      if (!crmClient) { skipped++; return; }
      try {
        const contacts = await akuiteoFetch('GET', `/crm/customers/${akCid}/contacts`);
        if (!Array.isArray(contacts) || contacts.length === 0) return;

        const rows = contacts.map(ct => ({
          id: 'ct_' + String(ct.id).replace(/[^a-zA-Z0-9]/g, '_') + '_' + crmClient.id.substring(0, 8),
          client_id: crmClient.id,
          akuiteo_id: String(ct.id),
          akuiteo_customer_id: akCid,
          code: ct.code || null,
          nom: ct.name || '',
          prenom: ct.firstName || null,
          titre: ct.title || null,
          fonction: ct.functionTitle || ct.position || null,
          service: ct.service || null,
          email: ct.email || null,
          email2: ct.email2 || null,
          telephone: ct.phone || null,
          mobile: ct.mobilePhone || null,
          adresse: ct.address?.line1 || null,
          code_postal: ct.address?.postalCode || null,
          ville: ct.address?.city || null,
          commentaire: ct.comment || null,
        }));

        const { error } = await sb.from('contacts').upsert(rows, { onConflict: 'id' });
        if (error) { console.warn(`  Upsert contacts ${akCid}:`, error.message); errors++; return; }
        synced += rows.length;
      } catch (e) {
        console.warn(`  Fetch contacts ${akCid}:`, e.message);
        errors++;
      }
    }));
    if (i % 100 === 0 && i > 0) log(`  Progression: ${i}/${akIds.length} clients traités`);
  }

  log(`Terminé: ${synced} contacts synchronisés, ${errors} erreurs, ${skipped} ignorés`);
}

syncContacts().catch(e => { console.error('ERREUR:', e); process.exit(1); });
