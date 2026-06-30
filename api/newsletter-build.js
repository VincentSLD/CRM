// Génération IA de la newsletter hebdomadaire du CRM.
// Reçoit les données déjà agrégées côté navigateur (POST), appelle Claude (avec recherche
// web pour la conjoncture bâtiment / taux immobilier) et renvoie le corps HTML de l'email.
//
// Variable d'environnement requise (Vercel) : ANTHROPIC_API_KEY
//
// Body attendu : {
//   data: {...},            // données agrégées de la semaine (clients, opportunités, marchés, etc.)
//   recipientName: string,  // prénom du destinataire (section perso / salutation)
//   ton: 'convivial'|'pro'|'fun',
//   sections: {...},        // sections activées
//   useWeb: boolean,        // inclure la recherche web conjoncture
//   crmUrl: string          // URL du CRM (pour les boutons « Ouvrir le CRM »)
// }

const MODEL = 'claude-sonnet-4-6';

async function callClaude(key, body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('anthropic ' + r.status + ': ' + (j.error ? j.error.message : JSON.stringify(j).slice(0, 300)));
  return j;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configuré' });

  const { data = {}, recipientName = '', ton = 'convivial', sections = {}, useWeb = true, crmUrl = '' } = req.body || {};

  const tonDesc = ton === 'fun'
    ? "très enjoué, complice, avec une pointe d'humour BTP (une petite blague/punchline), des emojis bien dosés"
    : ton === 'pro'
    ? 'professionnel et chaleureux, sobre, peu d\'emojis'
    : 'convivial, positif et motivant, emojis bien dosés';

  const sysParts = [
    "Tu es le rédacteur de l'infolettre hebdomadaire interne du CRM du groupe NOVAM Ingénierie (bureaux d'études techniques du bâtiment : structure, géotechnique/études de sol, VRD, fluides, environnement ; entités GPH, REGAR/GPH-R, SERBA, GRAVITY, ECTS, EXECOME, etc., dans le Grand Ouest).",
    "Tu écris une newsletter destinée aux collaborateurs commerciaux, à lire le lundi matin. Objectif : donner envie de se connecter au CRM.",
    'Ton : ' + tonDesc + '.',
    "Tu produis UNIQUEMENT le corps HTML de l'email (pas de <html>/<head>/<body>, pas de balises markdown, pas de ``` ). HTML email compatible : tableaux et styles INLINE uniquement, largeur max 640px, police Arial/Helvetica, couleurs sobres (accent #4f8ff7, vert #10b981, rouge #ef4444, orange #f59e0b). Titres de section en <h2 style=...>. Pas de JavaScript, pas d'images externes obligatoires (emojis autorisés).",
    "Structure souple selon les données fournies : édito de bienvenue personnalisé, météo du pipeline, analyses clés, top client par agence, opportunités, marchés publics travaux (bâtiment & environnement), nouveaux clients, clients dormants à réveiller, nouveaux concurrents, conjoncture du bâtiment + taux immobilier, agenda à venir, et si pertinent un podium/classement et les fêtes/anniversaires.",
    "N'invente JAMAIS de chiffres : utilise seulement les données fournies. Si une section est vide, soit tu l'omets, soit tu mets une phrase légère. Les montants sont en euros HT.",
    crmUrl ? ("Ajoute des boutons d'appel à l'action « Ouvrir le CRM » pointant vers " + crmUrl + " (encourage la connexion).") : '',
    "Termine par une signature légère « — NOVA, votre assistant CRM 🤖 » et une note discrète « Vous pouvez vous désabonner depuis Mon espace dans le CRM ».",
  ].filter(Boolean);

  const userPrompt = [
    "Voici les données agrégées de la semaine (JSON). Rédige l'infolettre en français.",
    recipientName ? ('Destinataire : ' + recipientName + ' (salue-le/la par son prénom).') : '',
    useWeb ? "Avant de rédiger la section « Conjoncture », fais 1 à 3 recherches web RÉCENTES et FRANÇAISES sur : activité/conjoncture du secteur du bâtiment (FFB/Insee), indice du coût de la construction (BT01/ICC), et taux des crédits immobiliers. Cite brièvement 1-2 chiffres datés avec la source (nom + lien)." : "Pas de recherche web : rédige une section conjoncture courte et générique sans chiffres inventés, ou omets-la.",
    'Sections activées (true = inclure) : ' + JSON.stringify(sections),
    'DONNÉES :',
    '```json',
    JSON.stringify(data).slice(0, 60000),
    '```',
  ].filter(Boolean).join('\n');

  const body = {
    model: MODEL,
    max_tokens: 6000,
    system: sysParts.join('\n'),
    messages: [{ role: 'user', content: userPrompt }],
  };
  if (useWeb) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }];

  try {
    const j = await callClaude(key, body);
    const html = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!html) return res.status(502).json({ error: 'Réponse IA vide' });
    // Nettoyage : retirer d'éventuels fences markdown
    const clean = html.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return res.status(200).json({ html: clean });
  } catch (e) {
    console.error('newsletter-build:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
