#!/usr/bin/env node
// ═══ Synchronisation des collaborateurs depuis Akuiteo ═══
const { sb, fetchAllPaginated, log } = require('./config');

async function syncCollaborateurs() {
  log('=== SYNC COLLABORATEURS ===');

  const employees = await fetchAllPaginated('/workforce/employees/search', { code: { operator: 'LIKE', value: '%' } });
  log(`${employees.length} collaborateurs récupérés depuis Akuiteo`);

  const rows = employees.map(e => ({
    id: 'emp_' + String(e.id).replace(/[^a-zA-Z0-9]/g, '_'),
    akuiteo_id: String(e.id),
    code: e.code || null,
    nom: e.name || '',
    prenom: e.firstName || null,
    titre: e.title || null,
    email: e.email || null,
    telephone: e.phone || null,
    mobile: e.mobilePhone || null,
    fonction: e.jobType || null,
    externe: e.external || false,
    generique: e.generic || false,
    cadre: e.executive || false,
  }));

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await sb.from('collaborateurs').upsert(rows.slice(i, i + 100), { onConflict: 'id' });
    if (error) console.warn('  Upsert err:', error.message);
  }

  log(`Terminé: ${rows.length} collaborateurs synchronisés`);
}

syncCollaborateurs().catch(e => { console.error('ERREUR:', e); process.exit(1); });
