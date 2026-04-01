#!/usr/bin/env node
// ═══ Exécute toutes les synchronisations dans l'ordre ═══
const { execSync } = require('child_process');
const path = require('path');

const scripts = [
  'sync-clients.js',
  'sync-contacts.js',
  'sync-documents.js',
  'sync-marches.js',
  'sync-collaborateurs.js',
];

const ts = () => new Date().toISOString().replace('T', ' ').substring(0, 19);

console.log(`[${ts()}] ========================================`);
console.log(`[${ts()}] SYNCHRONISATION COMPLÈTE AKUITEO → CRM`);
console.log(`[${ts()}] ========================================\n`);

for (const script of scripts) {
  const scriptPath = path.join(__dirname, script);
  console.log(`[${ts()}] ▶ Lancement: ${script}`);
  try {
    execSync(`node "${scriptPath}"`, { stdio: 'inherit', timeout: 600000 });
    console.log(`[${ts()}] ✓ ${script} terminé\n`);
  } catch (e) {
    console.error(`[${ts()}] ✗ ${script} ERREUR (code: ${e.status})\n`);
  }
}

console.log(`[${ts()}] ========================================`);
console.log(`[${ts()}] SYNCHRONISATION TERMINÉE`);
console.log(`[${ts()}] ========================================`);
