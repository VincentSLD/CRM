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

// Rubriques de veille web (clé → libellé + consigne)
const WEB_RUBRIQUES = {
  conjoncture: { label: 'Conjoncture bâtiment & indices', query: "activité/conjoncture du secteur du bâtiment en France (FFB, Insee) et indice du coût de la construction (BT01 ou ICC)" },
  taux: { label: 'Taux & financement', query: "taux des crédits immobiliers, taux directeur BCE, PTZ et aides à la rénovation (MaPrimeRénov')" },
  rga: { label: 'Sécheresse & argile (RGA)', query: "arrêtés de catastrophe naturelle sécheresse récents et retrait-gonflement des argiles (RGA), obligation d'étude géotechnique G1 loi ELAN" },
  permis: { label: 'Permis & mises en chantier', query: "derniers chiffres des permis de construire et des mises en chantier de logements en France (SDES/Sit@del), tendance" },
  reglementaire: { label: 'Réglementaire & normes', query: "actualités réglementaires construction : ZAN, RE2020, DPE, décret tertiaire, audit énergétique" },
  materiaux: { label: 'Prix des matériaux', query: "évolution récente des prix des matériaux de construction (acier, ciment, bois, bitume) et indices" },
  appels_projets: { label: 'Appels à projets & aides', query: "appels à projets et aides récents pour le bâtiment/l'énergie/l'eau (ADEME, France 2030)" },
  projets_locaux: { label: 'Grands projets régionaux', query: "grands projets de construction / ZAC / aménagements annoncés récemment en Pays de la Loire, Nouvelle-Aquitaine et Bretagne" },
  concurrence_web: { label: 'Veille concurrence (BE)', query: "actualités récentes des bureaux d'études techniques / géotechnique en France (rachats, implantations, levées de fonds)" },
  innovation: { label: 'Innovation construction', query: "innovations et tendances récentes dans la construction (IA, BIM, matériaux biosourcés, réemploi, géotechnique)" },
  agenda_pro: { label: 'Agenda salons & événements', query: "salons et événements professionnels du BTP / géotechnique à venir en France (BATIMAT, Salon des Maires, etc.)" },
};
const WEB_KEYS = Object.keys(WEB_RUBRIQUES);
// Recherche web pour les rubriques demandées → texte groupé (### Titre + puces avec sources)
async function fetchWebVeille(rubriqueKeys) {
  const items = (rubriqueKeys || []).map(k => WEB_RUBRIQUES[k] ? { k, ...WEB_RUBRIQUES[k] } : null).filter(Boolean);
  if (!items.length) return '';
  const ask = items.map((it, i) => `${i + 1}. « ${it.label} » : ${it.query}`).join('\n');
  try {
    const j = await callClaude({
      model: MODEL, max_tokens: 2600,
      system: "Tu es un analyste de veille pour un bureau d'études du bâtiment en France. Tu DOIS utiliser l'outil de recherche web pour trouver des informations RÉCENTES et FRANÇAISES.",
      messages: [{ role: 'user', content: "Recherche sur le web (sources françaises récentes) et renvoie, pour CHAQUE rubrique ci-dessous, 2 à 3 puces FACTUELLES et datées avec source. Format STRICT, sans intro ni conclusion : pour chaque rubrique, une ligne « ### <Titre exact> » puis les puces une par ligne commençant par '- ' = info datée + courte explication + (Source : Nom — URL). Si rien de fiable : « ### <Titre> » puis « - (pas d'actualité notable cette semaine) ».\n\nRubriques :\n" + ask }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: Math.min(10, items.length * 2) }],
    });
    return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  } catch (e) { console.error('fetchWebVeille:', e.message); return ''; }
}
async function generateHtml(data, opts) {
  const o = opts || {};
  const sys = [
    "Tu es le rédacteur de l'infolettre hebdomadaire interne du CRM du groupe NOVAM Ingénierie (bureaux d'études techniques du bâtiment : structure, géotechnique/études de sol, VRD, fluides, environnement ; entités GPH, REGAR/GPH-R, SERBA, GRAVITY, ECTS, EXECOME). Lecteurs : commerciaux, lundi matin. Objectif : donner envie de se connecter au CRM.",
    'Ton convivial, positif et motivant, emojis bien dosés. Salutation collective (ex. « Bonjour à toutes et à tous »).',
    "Tu produis UNIQUEMENT le corps HTML de l'email (pas de <html>/<head>/<body>, pas de markdown, pas de ```). Tableaux + styles INLINE uniquement, largeur max 640px, police Arial/Helvetica. PALETTE NOVAM (violet) : bandeau en dégradé linear-gradient(135deg,#7c3aed,#4c1d95) texte blanc ; accent/liens/boutons #7c3aed ; fonds doux #f5f0ff ; violet secondaire #8b5cf6 ; vert #10b981 / rouge #ef4444 / orange #f59e0b pour les statuts. Titres de section en <h2> avec fine bordure basse grise.",
    "Sections selon données ET activées : édito + bonne fête / anniversaires, météo du pipeline, analyses clés, top client par agence, opportunités, marchés publics travaux bâtiment & environnement (avec liens), nouveaux clients, dormants à réveiller, nouveaux concurrents, un bloc « 🌐 Veille externe » (rubriques web fournies), agenda à venir, podium & badges, « le saviez-vous » + défi.",
    "N'invente JAMAIS de chiffres : seulement les données fournies. Omets les sections vides ou désactivées.",
    CRM_URL ? ('Ajoute un bouton CTA « Ouvrir le CRM » (fond #7c3aed) vers ' + CRM_URL + '.') : '',
    "Termine par « — NOVA, votre assistant CRM 🤖 » et une note discrète de désabonnement depuis Mon espace.",
  ].filter(Boolean).join('\n');
  const user = [
    'Rédige l\'infolettre en français à partir de ces données de la semaine.',
    o.sections ? ('Sections activées (true = inclure, omets les autres) : ' + JSON.stringify(o.sections)) : '',
    o.veille
      ? ("Bloc « 🌐 Veille externe » : METS EN FORME en HTML les faits ci-dessous, groupés par rubrique (« ### Titre »). Pour chaque rubrique : un <h3 style=\"font-size:14px;margin:14px 0 4px;color:#4c1d95\">Titre</h3> puis une liste <ul><li> ; transforme « (Source : Nom — URL) » en <a href=\"URL\" style=\"color:#7c3aed\">Nom</a>. Ignore les rubriques « pas d'actualité notable »." + (o.allowedLabels ? " N'INCLUS QUE ces rubriques : " + o.allowedLabels.join(', ') + '.' : '') + "\nFAITS DE VEILLE :\n" + o.veille)
      : "Pas de données de veille web : OMETS le bloc veille externe.",
    '```json', JSON.stringify(data).slice(0, 60000), '```',
  ].filter(Boolean).join('\n');
  const j = await callClaude({ model: MODEL, max_tokens: 6000, system: sys, messages: [{ role: 'user', content: user }] });
  const html = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  return html.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

// ─ Brief commercial personnel (par abonné) ─
async function aggregateBrief(managerId, email, nom) {
  const now = new Date(); const todayISO = now.toISOString().slice(0, 10);
  const weekAgoISO = new Date(now.getTime() - 7 * 864e5).toISOString();
  const weekAhead = new Date(now.getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const year = now.getFullYear(); const yearStart = year + '-01-01';
  const mid = encodeURIComponent(managerId);
  const out = { meta: { commercial: nom, periode_debut: weekAgoISO.slice(0, 10), periode_fin: todayISO, crmUrl: CRM_URL } };

  const [myClients, opps, devis, rel, fact, tch, nv, dorm, objc] = await Promise.all([
    sbGet('clients', 'select=id&account_manager_id=eq.' + mid + '&limit=5000'),
    sbGet('opportunites', 'select=nom,client_name,montant,statut,date_signature,probabilite,responsable_id&responsable_id=eq.' + mid + '&limit=2000'),
    sbGet('devis', 'select=ref,client_name,montant,statut,date,responsable_id&responsable_id=eq.' + mid + '&limit=2000'),
    sbGet('relances_devis', 'select=devis_id&limit=5000'),
    sbGet('factures', 'select=ref,client_name,montant,reste_a_payer,statut,jours_retard,date,responsable_id&responsable_id=eq.' + mid + '&limit=3000'),
    sbGet('taches_commerciales', 'select=titre,echeance,client_name,statut,assigne_id,assigne_email&statut=in.(a_faire,en_cours)&or=(assigne_id.eq.' + mid + ',assigne_email.eq.' + encodeURIComponent(email || '') + ')&limit=100'),
    sbGet('clients', 'select=name,city,created_at&account_manager_id=eq.' + mid + '&created_at=gte.' + encodeURIComponent(weekAgoISO) + '&order=created_at.desc&limit=20'),
    sbGet('clients', 'select=name,city,ca&account_manager_id=eq.' + mid + '&status=eq.dormant&order=ca.desc.nullslast&limit=8'),
    sbGet('objectifs_clients', 'select=client_id,objectif_ht,annee&annee=eq.' + year + '&limit=5000'),
  ]);
  const ids = new Set((myClients || []).map(c => c.id));
  const relSet = new Set((rel || []).map(r => r.devis_id));

  const myT = (tch || []);
  const mapT = t => ({ titre: t.titre, echeance: (t.echeance || '').slice(0, 10), client: t.client_name || '' });
  out.taches = {
    semaine: myT.filter(t => t.echeance && t.echeance.slice(0, 10) >= todayISO && t.echeance.slice(0, 10) <= weekAhead).map(mapT),
    en_retard: myT.filter(t => t.echeance && t.echeance.slice(0, 10) < todayISO).map(mapT),
  };
  const O = (opps || []); const enCours = O.filter(o => o.statut === 'IN_PROGRESS');
  out.pipeline = { en_cours_nb: enCours.length, en_cours_montant: Math.round(enCours.reduce((s, o) => s + num(o.montant), 0)), pondere: Math.round(enCours.reduce((s, o) => s + num(o.montant) * (num(o.probabilite) / 100), 0)) };
  out.signatures_semaine = enCours.filter(o => o.date_signature && o.date_signature >= todayISO && o.date_signature <= weekAhead).map(o => ({ nom: o.nom, client: o.client_name, montant: o.montant, signature: o.date_signature }));
  out.opp_a_relancer = enCours.filter(o => o.date_signature && o.date_signature < todayISO).sort((a, b) => num(b.montant) - num(a.montant)).slice(0, 8).map(o => ({ nom: o.nom, client: o.client_name, montant: o.montant, signature: o.date_signature }));
  out.ca_signe_semaine = Math.round(O.filter(o => o.statut === 'WON' && (o.date_signature || '') >= weekAgoISO.slice(0, 10)).reduce((s, o) => s + num(o.montant), 0));

  const joursDepuis = d => d ? Math.round((Date.now() - new Date(d)) / 864e5) : 0;
  out.devis_a_relancer = (devis || []).filter(d => d.statut === 'sent' && !relSet.has(d.id) && d.date && joursDepuis(d.date) >= 15).slice(0, 12).map(d => ({ ref: d.ref, client: d.client_name, montant: num(d.montant), jours: joursDepuis(d.date) }));
  out.factures_impayees = (fact || []).filter(f => f.statut !== 'payee' && num(f.reste_a_payer || f.montant) > 0 && num(f.jours_retard) > 0).slice(0, 10).map(f => ({ ref: f.ref, client: f.client_name, montant: num(f.reste_a_payer || f.montant), jours: num(f.jours_retard) }));

  out.nouveaux_clients = (nv || []).map(c => ({ nom: c.name, ville: c.city, depuis: (c.created_at || '').slice(0, 10) }));
  out.dormants = (dorm || []).map(c => ({ nom: c.name, ville: c.city, ca: Math.round(num(c.ca)) }));
  const objectif = (objc || []).filter(o => ids.has(o.client_id)).reduce((s, o) => s + num(o.objectif_ht), 0);
  const realise = (fact || []).filter(f => (f.date || '') >= yearStart).reduce((s, f) => s + num(f.montant), 0);
  out.objectif = objectif > 0 ? { cible: Math.round(objectif), realise: Math.round(realise), pct: Math.round(realise / objectif * 100) } : { realise: Math.round(realise) };
  return out;
}
async function generateBriefHtml(data, recipientName) {
  const sys = [
    "Tu rédiges le BRIEF COMMERCIAL HEBDOMADAIRE PERSONNEL d'un commercial du groupe NOVAM Ingénierie (bureaux d'études techniques du bâtiment). Email privé, adressé à UNE personne, sur SON portefeuille uniquement.",
    'Ton convivial, motivant et orienté action. Tutoiement.',
    "Tu produis UNIQUEMENT le corps HTML (pas de <html>/<head>/<body>, pas de markdown, pas de ```). Tableaux + styles INLINE, max 640px, Arial/Helvetica. PALETTE NOVAM (violet) : bandeau dégradé linear-gradient(135deg,#7c3aed,#4c1d95) texte blanc ; accent/liens/boutons #7c3aed ; fonds doux #f5f0ff ; vert #10b981 / rouge #ef4444 / orange #f59e0b pour les statuts. Titres <h2> avec fine bordure basse grise.",
    "Structure (omets les sections vides) : salutation + « tes 3 priorités de la semaine » ; mon agenda (tâches + signatures) ; mes relances (devis, opportunités, factures impayées) ; ma performance & objectif (barre de progression HTML inline + %, pipeline, CA signé) ; mon portefeuille (nouveaux clients, dormants) ; mot de motivation.",
    "N'invente JAMAIS de chiffres. Barre objectif : div gris conteneur + div violet dont la largeur = pourcentage.",
    CRM_URL ? ('Bouton CTA « Ouvrir mon CRM » (fond #7c3aed) vers ' + CRM_URL + '.') : '',
    "Termine par « — NOVA, ton assistant CRM 🤖 » + note de désabonnement depuis Mon espace.",
  ].filter(Boolean).join('\n');
  const user = ['Rédige le brief en français pour : ' + (recipientName || 'le commercial') + '.', 'DONNÉES (son périmètre) :', '```json', JSON.stringify(data).slice(0, 60000), '```'].join('\n');
  const j = await callClaude({ model: MODEL, max_tokens: 5000, system: sys, messages: [{ role: 'user', content: user }] });
  const html = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  return html.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
}
async function graphSend(token, email, subject, html) {
  const r = await fetch('https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(email) + '/sendMail', {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: [{ emailAddress: { address: email } }] }, saveToSentItems: false }),
  });
  if (!r.ok) throw new Error((await r.text()).slice(0, 120));
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'] || '';
    if (auth !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });
  }
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configuré' });
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ error: 'AZURE_CLIENT_ID / AZURE_CLIENT_SECRET non configurés' });

  try {
    // Abonnés (newsletter groupe, avec leurs préférences) + abonnés (brief perso)
    const groupSubs = (await sbGet('newsletter_prefs', 'select=email,nom,ton,sections&abonne=eq.true&email=not.is.null')) || [];
    const briefSubs = (await sbGet('newsletter_prefs', 'select=email,nom,manager_id&brief_perso=eq.true&email=not.is.null&manager_id=not.is.null')) || [];
    const force = req.query && (req.query.force === '1' || req.query.test === '1');
    if (!groupSubs.length && !briefSubs.length && !force) return res.status(200).json({ ok: true, message: 'Aucun abonné', envoyes: 0 });

    // Anti-doublon : une édition déjà créée depuis lundi 0h ?
    const monday = new Date(); const day = (monday.getDay() + 6) % 7; monday.setDate(monday.getDate() - day); monday.setHours(0, 0, 0, 0);
    const existing = await sbGet('newsletters', 'select=id&created_at=gte.' + encodeURIComponent(monday.toISOString()) + '&limit=1');
    if (Array.isArray(existing) && existing.length && !force) return res.status(200).json({ ok: true, message: 'Édition déjà générée cette semaine', envoyes: 0 });

    const token = await appToken();
    const wrap = inner => `<div style="max-width:640px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#222">${inner}</div>`;
    const selOf = s => (s && typeof s === 'object') ? s : {};

    // 1) Newsletter groupe — générée PAR DESTINATAIRE selon ses sections + rubriques web
    let sent = 0; const errors = []; let firstHtml = null;
    if (groupSubs.length) {
      const data = await aggregateWeek();
      // Recherche web : une seule fois pour l'UNION des rubriques sélectionnées par les abonnés
      const union = new Set();
      groupSubs.forEach(s => { const sec = selOf(s.sections); WEB_KEYS.forEach(k => { if (sec[k] !== false) union.add(k); }); });
      const veille = union.size ? await fetchWebVeille([...union]) : '';
      const subject = '📰 Infolettre CRM — semaine du ' + new Date().toLocaleDateString('fr-FR');
      for (const s of groupSubs) {
        try {
          const sec = selOf(s.sections);
          const allowedLabels = WEB_KEYS.filter(k => sec[k] !== false).map(k => WEB_RUBRIQUES[k].label);
          const inner = await generateHtml(data, { veille, allowedLabels, sections: sec, ton: s.ton });
          if (!inner) { errors.push('news ' + s.email + ': génération vide'); continue; }
          const html = wrap(inner);
          if (!firstHtml) { firstHtml = html; try { await sbReq('newsletters', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ titre: subject, periode_debut: data.meta.periode_debut, periode_fin: data.meta.periode_fin, html, data, cree_par: 'cron', envoye_a: groupSubs.length }) }); } catch (e) {} }
          await graphSend(token, s.email, subject, html); sent++;
        } catch (e) { errors.push('news ' + s.email + ': ' + e.message); }
      }
    }

    // 2) Briefs commerciaux personnels (1 génération par abonné)
    let briefSent = 0; const briefErr = [];
    const subjBrief = '📊 Mon brief commercial — semaine du ' + new Date().toLocaleDateString('fr-FR');
    for (const s of briefSubs) {
      try {
        const d = await aggregateBrief(s.manager_id, s.email, s.nom);
        const inner = await generateBriefHtml(d, (s.nom || '').split(' ')[0]);
        if (!inner) { briefErr.push(s.email + ': génération vide'); continue; }
        await graphSend(token, s.email, subjBrief, wrap(inner));
        briefSent++;
      } catch (e) { briefErr.push(s.email + ': ' + e.message); }
    }

    return res.status(200).json({ ok: true, abonnes: groupSubs.length, envoyes: sent, erreurs: errors, briefs_abonnes: briefSubs.length, briefs_envoyes: briefSent, briefs_erreurs: briefErr });
  } catch (e) {
    console.error('newsletter-cron:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
