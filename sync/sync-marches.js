#!/usr/bin/env node
// ═══ Construction des marchés et affaires à partir des documents ═══
const { sb, akuiteoFetch, log } = require('./config');

const ENRICH_PARALLEL = 10;

async function syncMarches() {
  log('=== SYNC MARCHÉS & AFFAIRES ===');

  // Charger tous les documents depuis Supabase
  async function loadAll(table, fields) {
    let all = [], from = 0;
    while (true) {
      const { data } = await sb.from(table).select(fields).range(from, from + 999);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    return all;
  }

  const [devis, commandes, factures] = await Promise.all([
    loadAll('devis', 'id,projet,client_id,client_name,montant,montant_ttc,date,agence,societe'),
    loadAll('commandes', 'id,projet,client_id,client_name,montant,montant_ttc,date,agence,societe'),
    loadAll('factures', 'id,projet,client_id,client_name,montant,montant_ttc,date,agence,societe'),
  ]);
  log(`Documents chargés: ${devis.length} devis, ${commandes.length} cmd, ${factures.length} fact`);

  const allDocs = [...devis, ...commandes, ...factures].filter(d => d.projet);
  log(`${allDocs.length} documents avec un projectId`);

  // Grouper par projectId → affaires
  const affaireMap = {};
  allDocs.forEach(d => {
    const pid = d.projet;
    if (!affaireMap[pid]) affaireMap[pid] = { docs: [], client_id: null, client_name: null };
    affaireMap[pid].docs.push(d);
    if (d.client_id) { affaireMap[pid].client_id = d.client_id; affaireMap[pid].client_name = d.client_name; }
  });

  // Grouper affaires par préfixe → marchés
  const marcheMap = {};
  for (const [pid, aff] of Object.entries(affaireMap)) {
    const parts = pid.split('.');
    const prefix = parts.length >= 2 ? parts.slice(0, 2).join('.') : pid;
    if (!marcheMap[prefix]) marcheMap[prefix] = { affaires: {}, client_id: null, client_name: null };
    marcheMap[prefix].affaires[pid] = aff;
    if (aff.client_id) { marcheMap[prefix].client_id = aff.client_id; marcheMap[prefix].client_name = aff.client_name; }
  }
  log(`${Object.keys(marcheMap).length} marchés, ${Object.keys(affaireMap).length} affaires détectés`);

  // Enrichir les projets depuis l'API Akuiteo
  const projectIds = Object.keys(affaireMap);
  const projDetails = {};
  log(`Enrichissement de ${projectIds.length} projets depuis Akuiteo...`);
  for (let i = 0; i < projectIds.length; i += ENRICH_PARALLEL) {
    const chunk = projectIds.slice(i, i + ENRICH_PARALLEL);
    await Promise.all(chunk.map(async pid => {
      try {
        const detail = await akuiteoFetch('POST', `/projectmanagement/projects/${pid}/read`, {
          options: ['PROJECT_SUB_CATEGORY', 'PROJECT_SUB_CATEGORY_LEVEL2', 'MANAGER']
        });
        if (detail) projDetails[pid] = detail;
      } catch { /* ignore */ }
    }));
    if (i % 100 === 0 && i > 0) log(`  ${i}/${projectIds.length} projets enrichis`);
  }
  log(`${Object.keys(projDetails).length} projets enrichis`);

  // Construire les marchés
  const marcheRows = Object.entries(marcheMap).map(([prefix, m]) => {
    const allAffDocs = Object.values(m.affaires).flatMap(a => a.docs);
    const dates = allAffDocs.map(d => d.date).filter(Boolean).sort();
    return {
      id: 'akm_' + prefix.replace(/[^a-zA-Z0-9.]/g, '_'),
      akuiteo_id: prefix,
      ref: prefix,
      nom: 'Marché ' + prefix,
      client_id: m.client_id,
      client_name: m.client_name,
      date_debut: dates[0] || null,
      date_fin: dates[dates.length - 1] || null,
      montant: allAffDocs.reduce((s, d) => s + (d.montant || 0), 0),
      montant_ttc: allAffDocs.reduce((s, d) => s + (d.montant_ttc || 0), 0),
      statut: 'en_cours',
      agence: allAffDocs.find(d => d.agence)?.agence || null,
      nb_affaires: Object.keys(m.affaires).length,
    };
  });

  for (let i = 0; i < marcheRows.length; i += 100) {
    const { error } = await sb.from('marches').upsert(marcheRows.slice(i, i + 100), { onConflict: 'id' });
    if (error) console.warn('  Marchés upsert err:', error.message);
  }
  log(`${marcheRows.length} marchés enregistrés`);

  // Construire les affaires
  const affaireRows = [];
  for (const [prefix, m] of Object.entries(marcheMap)) {
    const marcheId = 'akm_' + prefix.replace(/[^a-zA-Z0-9.]/g, '_');
    for (const [pid, aff] of Object.entries(m.affaires)) {
      const proj = projDetails[pid] || {};
      const dates = aff.docs.map(d => d.date).filter(Boolean).sort();
      affaireRows.push({
        id: 'aka_' + pid.replace(/[^a-zA-Z0-9.]/g, '_'),
        akuiteo_id: pid,
        ref: pid,
        nom: proj.name || 'Affaire ' + pid,
        marche_id: marcheId,
        client_id: aff.client_id || m.client_id,
        client_name: aff.client_name || m.client_name,
        date_debut: dates[0] || null,
        date_fin: dates[dates.length - 1] || null,
        montant: aff.docs.reduce((s, d) => s + (d.montant || 0), 0),
        montant_ttc: aff.docs.reduce((s, d) => s + (d.montant_ttc || 0), 0),
        statut: 'en_cours',
        agence: aff.docs.find(d => d.agence)?.agence || null,
        code_projet: pid,
        apporteur_affaire: proj.projectSubCategory?.name || null,
        responsable: proj.manager ? [proj.manager.name, proj.manager.firstName].filter(Boolean).join(' ') : null,
      });
    }
  }

  for (let i = 0; i < affaireRows.length; i += 100) {
    const { error } = await sb.from('affaires').upsert(affaireRows.slice(i, i + 100), { onConflict: 'id' });
    if (error) console.warn('  Affaires upsert err:', error.message);
  }
  log(`${affaireRows.length} affaires enregistrées`);

  // Lier les documents aux affaires et marchés
  log('Liaison des documents aux affaires et marchés...');
  for (const [pid, aff] of Object.entries(affaireMap)) {
    const parts = pid.split('.');
    const prefix = parts.length >= 2 ? parts.slice(0, 2).join('.') : pid;
    const marcheId = 'akm_' + prefix.replace(/[^a-zA-Z0-9.]/g, '_');
    const affaireId = 'aka_' + pid.replace(/[^a-zA-Z0-9.]/g, '_');
    const proj = projDetails[pid] || {};
    const updateData = { marche_id: marcheId, affaire_id: affaireId, apporteur_affaire: proj.projectSubCategory?.name || null };
    await Promise.all([
      sb.from('devis').update(updateData).eq('projet', pid),
      sb.from('commandes').update(updateData).eq('projet', pid),
      sb.from('factures').update(updateData).eq('projet', pid),
    ]);
  }

  log('=== SYNC MARCHÉS & AFFAIRES TERMINÉE ===');
}

syncMarches().catch(e => { console.error('ERREUR:', e); process.exit(1); });
