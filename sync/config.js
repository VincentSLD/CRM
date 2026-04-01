// ═══ Configuration commune pour les scripts de synchronisation ═══
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdWNjbml5b2Z6dndnb294amFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDQyNjgsImV4cCI6MjA4ODQ4MDI2OH0.dPerW1BApAxe26xzv9i7oWIubgGuzO5RibMvs-MFm88';
const AKUITEO_URL = process.env.AKUITEO_URL || 'https://novamingenierie-test.myakuiteo.com/akuiteo/rest';
const AKUITEO_USER = process.env.AKUITEO_USER || 'API1';
const AKUITEO_PASS = process.env.AKUITEO_PASS || 'API1';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function akuiteoFetch(method, path, body = null, opts2 = {}) {
  const [basePath, qs] = path.split('?');
  const url = AKUITEO_URL + basePath + (qs ? '?' + qs : '');
  const auth = Buffer.from(`${AKUITEO_USER}:${AKUITEO_PASS}`).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': opts2.accept || 'application/json',
  };
  const opts = { method, headers };
  if (body && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Akuiteo ${r.status}: ${txt.substring(0, 300)}`);
  }
  const text = await r.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function fetchAllPaginated(path, criteria, pageSize = 200, max = 25000) {
  let all = [], offset = 0;
  while (true) {
    const batch = await akuiteoFetch('POST', `${path}?limit=${pageSize}&offset=${offset}`, criteria);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all = all.concat(batch);
    console.log(`  ${path}: offset=${offset} → ${batch.length} (total: ${all.length})`);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (all.length >= max) break;
  }
  return all;
}

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${ts}] ${msg}`);
}

module.exports = { sb, akuiteoFetch, fetchAllPaginated, log };
