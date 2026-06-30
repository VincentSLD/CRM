// Génération + envoi automatique de l'infolettre hebdomadaire du CRM.
// Déclenché par un cron Vercel (voir vercel.json, ex. lundi 7h). Autonome : agrège la semaine
// depuis Supabase (service role), génère le HTML via Claude (avec recherche web conjoncture),
// envoie à chaque abonné via Microsoft Graph (app-only) et archive l'édition.
//
// Variables d'environnement : ANTHROPIC_API_KEY, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET,
//   AZURE_TENANT_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET (optionnel),
//   CRM_URL (optionnel, pour le bouton « Ouvrir le CRM »).

const TENANT = process.env.AZURE_TENANT_ID || 'common';
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRM_URL = process.env.CRM_URL || '';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdWNjbml5b2Z6dndnb294amFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDQyNjgsImV4cCI6MjA4ODQ4MDI2OH0.dPerW1BApAxe26xzv9i7oWIubgGuzO5RibMvs-MFm88';

const MODEL = 'claude-sonnet-4-6';

async function sbReq(path, options = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + txt.slice(0, 200));
  return txt ? JSON.parse(txt) : null;
}
const sbGet = (table, qs) => sbReq(table + '?' + qs).catch(() => []);

async function appToken() {
  const params = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('token: ' + (j.error_description || JSON.stringify(j)));
  return j.access_token;
}

async function callClaude(body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('anthropic ' + r.status + ': ' + (j.error ? j.error.message : JSON.stringify(j).slice(0, 300)));
  return j;
}

const num = v => Number(v) || 0;

async function aggregateWeek() {
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const weekAgoISO = new Date(now.getTime() - 7 * 864e5).toISOString();
  const weekAhead = new Date(now.getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const yearAgo = new Date(now.getTime() - 365 * 864e5).toISOString().slice(0, 10);
  const out = { meta: { genere_le: now.toISOString(), periode_debut: weekAgoISO.slice(0, 10), periode_fin: todayISO, crmUrl: CRM_URL } };

  const [opps, fact, nv, dorm, conc, tch, prefs, collabs] = await Promise.all([
    sbGet('opportunites', 'select=nom,client_name,montant,statut,stage,responsable,date_creation,date_signature,chantier_dept&limit=3000'),
    sbGet('factures', 'select=client_id,client_name,montant,societe,agence,date&date=gte.' + yearAgo + '&limit=5000'),
    sbGet('clients', 'select=name,city,departement,created_at,status&created_at=gte.' + encodeURIComponent(weekAgoISO) + '&order=created_at.desc&limit=30'),
    sbGet('clients', 'select=name,city,ca&status=eq.dormant&order=ca.desc.nullslast&limit=8'),
    sbGet('concurrents', 'select=nom,ville,departement,created_at&created_at=gte.' + encodeURIComponent(weekAgoISO) + '&order=created_at.desc&limit=15'),
    sbGet('taches_commerciales', 'select=titre,echeance,assigne_nom,client_name&statut=in.(a_faire,en_cours)&echeance=gte.' + todayISO + '&echeance=lte.' + weekAhead + '&order=echeance&limit=25'),
    sbGet('newsletter_prefs', 'select=nom,date_naissance&date_naissance=not.is.null'),
    sbGet('collaborateurs', 'select=prenom&limit=300'),
  ]);

  const O = Array.isArray(opps) ? opps : [];
  const enCours = O.filter(o => o.statut === 'IN_PROGRESS');
  out.pipeline = {
    en_cours_nb: enCours.length,
    en_cours_montant: Math.round(enCours.reduce((s, o) => s + num(o.montant), 0)),
    pondere: Math.round(enCours.reduce((s, o) => s + num(o.montant) * (num(o.probabilite) / 100), 0)),
    signatures_depassees: enCours.filter(o => o.date_signature && o.date_signature < todayISO).length,
    signatures_sous_7j: enCours.filter(o => o.date_signature && o.date_signature >= todayISO && o.date_signature <= weekAhead).length,
  };
  const gagnees = O.filter(o => o.statut === 'WON' && (o.date_signature || '') >= weekAgoISO.slice(0, 10));
  out.opportunites = {
    nouvelles: O.filter(o => (o.date_creation || '') >= weekAgoISO).slice(0, 12).map(o => ({ nom: o.nom, client: o.client_name, montant: o.montant, stade: o.stage, dept: o.chantier_dept || '' })),
    gagnees: gagnees.slice(0, 12).map(o => ({ nom: o.nom, client: o.client_name, montant: o.montant, resp: o.responsable })),
    a_relancer: enCours.filter(o => o.date_signature && o.date_signature < todayISO).sort((a, b) => num(b.montant) - num(a.montant)).slice(0, 8).map(o => ({ nom: o.nom, client: o.client_name, montant: o.montant, signature: o.date_signature, resp: o.responsable })),
  };
  const podiumMap = {};
  gagnees.forEach(g => { const r = g.responsable || '—'; podiumMap[r] = (podiumMap[r] || 0) + num(g.montant); });
  out.podium = Object.entries(podiumMap).map(([resp, ca]) => ({ resp, ca: Math.round(ca) })).sort((a, b) => b.ca - a.ca).slice(0, 3);

  // Top client par agence (CA cumulé sur 12 mois)
  const byAg = {};
  (Array.isArray(fact) ? fact : []).forEach(f => { const ag = f.societe || f.agence; if (!ag || !f.client_id) return; const o = byAg[ag] || (byAg[ag] = {}); o[f.client_id] = o[f.client_id] || { ca: 0, nom: f.client_name }; o[f.client_id].ca += num(f.montant); });
  out.top_clients = Object.entries(byAg).map(([ag, clients]) => { const best = Object.values(clients).sort((a, b) => b.ca - a.ca)[0]; return best ? { agence: ag, client: best.nom, ca: Math.round(best.ca) } : null; }).filter(Boolean).sort((a, b) => b.ca - a.ca).slice(0, 12);

  out.nouveaux_clients = (nv || []).map(c => ({ nom: c.name, ville: c.city, dept: c.departement, depuis: (c.created_at || '').slice(0, 10) }));
  out.dormants = (dorm || []).map(c => ({ nom: c.name, ville: c.city, ca: Math.round(num(c.ca)) }));
  out.concurrents_nouveaux = (conc || []).map(c => ({ nom: c.nom, ville: c.ville, dept: c.departement }));
  out.agenda = { taches: (tch || []).map(t => ({ titre: t.titre, echeance: (t.echeance || '').slice(0, 10), qui: t.assigne_nom, client: t.client_name })), signatures: enCours.filter(o => o.date_signature && o.date_signature >= todayISO && o.date_signature <= weekAhead).slice(0, 12).map(o => ({ nom: o.nom, client: o.client_name, montant: o.montant, signature: o.date_signature })) };

  // Anniversaires de la semaine
  const md = d => d.slice(5, 10);
  const set = new Set(); for (let i = 0; i < 7; i++) { const d = new Date(now.getTime() + i * 864e5); set.add(String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')); }
  out.anniversaires = (prefs || []).filter(x => x.date_naissance && set.has(md(x.date_naissance))).map(x => ({ nom: x.nom, jour: x.date_naissance.slice(5, 10) }));
  out.collaborateurs_prenoms = (collabs || []).map(c => c.prenom).filter(Boolean).slice(0, 80);

  // Marchés publics travaux bâtiment & environnement (BOAMP) parus cette semaine
  try {
    const p = new URLSearchParams();
    p.set('where', `type_marche="TRAVAUX" and dateparution >= "${weekAgoISO.slice(0, 10)}" and search(objet, "bâtiment OR construction OR environnement OR réhabilitation OR rénovation")`);
    p.set('order_by', 'dateparution desc'); p.set('limit', '20');
    const r = await fetch('https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records?' + p.toString(), { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
    const j = await r.json();
    out.marches_publics = (j.results || []).slice(0, 15).map(a => ({ objet: (a.objet || '').slice(0, 180), acheteur: a.nomacheteur || '', dept: Array.isArray(a.code_departement) ? a.code_departement.join(',') : (a.code_departement || ''), date_limite: a.datelimitereponse || '', lien: a.url_avis || (a.idweb ? 'https://www.boamp.fr/avis/detail/' + a.idweb : '') }));
  } catch (e) { out.marches_publics = []; }

  return out;
}

async function generateHtml(data) {
  const sys = [
    "Tu es le rédacteur de l'infolettre hebdomadaire interne du CRM du groupe NOVAM Ingénierie (bureaux d'études techniques du bâtiment : structure, géotechnique/études de sol, VRD, fluides, environnement ; entités GPH, REGAR/GPH-R, SERBA, GRAVITY, ECTS, EXECOME). Lecteurs : commerciaux, lundi matin. Objectif : donner envie de se connecter au CRM.",
    'Ton convivial, positif et motivant, emojis bien dosés. Salutation collective (ex. « Bonjour à toutes et à tous »).',
    "Tu produis UNIQUEMENT le corps HTML de l'email (pas de <html>/<head>/<body>, pas de markdown, pas de ```). Tableaux + styles INLINE uniquement, largeur max 640px, police Arial/Helvetica. PALETTE NOVAM (violet) : bandeau en dégradé linear-gradient(135deg,#7c3aed,#4c1d95) texte blanc ; accent/liens/boutons #7c3aed ; fonds doux #f5f0ff ; violet secondaire #8b5cf6 ; vert #10b981 / rouge #ef4444 / orange #f59e0b pour les statuts. Titres de section en <h2> avec fine bordure basse grise.",
    "Sections selon données : édito + bonne fête (prénoms du jour) / anniversaires, météo du pipeline, analyses clés, top client par agence, opportunités (gagnées/nouvelles/à relancer), marchés publics travaux bâtiment & environnement (avec liens), nouveaux clients, dormants à réveiller, nouveaux concurrents, conjoncture BTP & taux immobilier, agenda à venir, podium & badges, « le saviez-vous » + défi de la semaine.",
    "N'invente JAMAIS de chiffres : seulement les données fournies. Omets les sections vides.",
    CRM_URL ? ('Ajoute un bouton CTA « Ouvrir le CRM » (fond #7c3aed) vers ' + CRM_URL + '.') : '',
    "Termine par « — NOVA, votre assistant CRM 🤖 » et une note discrète de désabonnement depuis Mon espace.",
  ].filter(Boolean).join('\n');
  const user = [
    'Rédige l\'infolettre en français à partir de ces données de la semaine.',
    "Avant la section conjoncture, fais 1 à 3 recherches web récentes et françaises : conjoncture du bâtiment (FFB/Insee), indice du coût de la construction (BT01/ICC), taux des crédits immobiliers. Cite 1-2 chiffres datés avec source (nom + lien).",
    '```json', JSON.stringify(data).slice(0, 60000), '```',
  ].join('\n');
  const j = await callClaude({ model: MODEL, max_tokens: 6000, system: sys, messages: [{ role: 'user', content: user }], tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }] });
  const html = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  return html.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'] || '';
    if (auth !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });
  }
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configuré' });
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ error: 'AZURE_CLIENT_ID / AZURE_CLIENT_SECRET non configurés' });

  try {
    // Abonnés
    const subs = await sbGet('newsletter_prefs', 'select=email&abonne=eq.true&email=not.is.null');
    const emails = [...new Set((subs || []).map(x => x.email).filter(Boolean))];
    const force = req.query && (req.query.force === '1' || req.query.test === '1');
    if (!emails.length && !force) return res.status(200).json({ ok: true, message: 'Aucun abonné', envoyes: 0 });

    // Anti-doublon : une édition déjà créée depuis lundi 0h ?
    const monday = new Date(); const day = (monday.getDay() + 6) % 7; monday.setDate(monday.getDate() - day); monday.setHours(0, 0, 0, 0);
    const existing = await sbGet('newsletters', 'select=id&created_at=gte.' + encodeURIComponent(monday.toISOString()) + '&limit=1');
    if (Array.isArray(existing) && existing.length && !force) return res.status(200).json({ ok: true, message: 'Édition déjà générée cette semaine', envoyes: 0 });

    const data = await aggregateWeek();
    const inner = await generateHtml(data);
    if (!inner) return res.status(502).json({ error: 'Génération IA vide' });
    const html = `<div style="max-width:640px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#222">${inner}</div>`;
    const subject = '📰 Infolettre CRM — semaine du ' + new Date().toLocaleDateString('fr-FR');

    // Archive
    try { await sbReq('newsletters', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ titre: subject, periode_debut: data.meta.periode_debut, periode_fin: data.meta.periode_fin, html, data, cree_par: 'cron', envoye_a: emails.length }) }); } catch (e) {}

    // Envoi : à chaque abonné depuis sa propre boîte (app-only, comme les rappels de tâches)
    let sent = 0; const errors = [];
    if (emails.length) {
      const token = await appToken();
      for (const email of emails) {
        try {
          const r = await fetch('https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(email) + '/sendMail', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: [{ emailAddress: { address: email } }] }, saveToSentItems: false }),
          });
          if (!r.ok) { errors.push(email + ': ' + (await r.text()).slice(0, 100)); continue; }
          sent++;
        } catch (e) { errors.push(email + ': ' + e.message); }
      }
    }
    return res.status(200).json({ ok: true, abonnes: emails.length, envoyes: sent, erreurs: errors });
  } catch (e) {
    console.error('newsletter-cron:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
