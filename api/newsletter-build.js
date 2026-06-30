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

// Rubriques de veille web disponibles (clé → libellé + consigne de recherche)
const WEB_RUBRIQUES = {
  conjoncture: { label: 'Conjoncture bâtiment & indices', query: "activité/conjoncture du secteur du bâtiment en France (FFB, Insee) et indice du coût de la construction (BT01 ou ICC)" },
  taux: { label: 'Taux & financement', query: "taux des crédits immobiliers, taux directeur BCE, PTZ et aides à la rénovation (MaPrimeRénov')" },
  rga: { label: 'Sécheresse & argile (RGA)', query: "arrêtés de catastrophe naturelle sécheresse récents et retrait-gonflement des argiles (RGA), obligation d'étude géotechnique G1 loi ELAN" },
  permis: { label: 'Permis & mises en chantier', query: "derniers chiffres des permis de construire et des mises en chantier de logements en France (SDES/Sit@del), tendance" },
  reglementaire: { label: 'Réglementaire & normes', query: "actualités réglementaires construction : ZAN (zéro artificialisation nette), RE2020, DPE, décret tertiaire, audit énergétique" },
  materiaux: { label: 'Prix des matériaux', query: "évolution récente des prix des matériaux de construction (acier, ciment, bois, bitume) et indices" },
  appels_projets: { label: 'Appels à projets & aides', query: "appels à projets et aides récents pour le bâtiment/l'énergie/l'eau (ADEME, France 2030)" },
  projets_locaux: { label: 'Grands projets régionaux', query: "grands projets de construction / ZAC / aménagements annoncés récemment en Pays de la Loire, Nouvelle-Aquitaine et Bretagne" },
  concurrence_web: { label: 'Veille concurrence (BE)', query: "actualités récentes des bureaux d'études techniques / géotechnique en France (rachats, implantations, levées de fonds)" },
  innovation: { label: 'Innovation construction', query: "innovations et tendances récentes dans la construction (IA, BIM, matériaux biosourcés, réemploi, géotechnique)" },
  agenda_pro: { label: 'Agenda salons & événements', query: "salons et événements professionnels du BTP / géotechnique à venir en France (BATIMAT, Salon des Maires, etc.)" },
};
// Recherche web pour les rubriques sélectionnées → texte groupé par rubrique (### Titre + puces avec sources).
// Étape séparée pour fiabiliser (toujours appelée) et permettre une mise en forme propre ensuite.
async function fetchWebVeille(key, rubriqueKeys) {
  const items = (rubriqueKeys || []).map(k => WEB_RUBRIQUES[k] ? { k, ...WEB_RUBRIQUES[k] } : null).filter(Boolean);
  if (!items.length) return '';
  const ask = items.map((it, i) => `${i + 1}. « ${it.label} » : ${it.query}`).join('\n');
  try {
    const j = await callClaude(key, {
      model: MODEL,
      max_tokens: 2600,
      system: "Tu es un analyste de veille pour un bureau d'études du bâtiment en France. Tu DOIS utiliser l'outil de recherche web pour trouver des informations RÉCENTES et FRANÇAISES.",
      messages: [{ role: 'user', content: "Recherche sur le web (sources françaises récentes) et renvoie, pour CHAQUE rubrique ci-dessous, 2 à 3 puces FACTUELLES et datées avec source. Format STRICT, sans introduction ni conclusion : pour chaque rubrique, d'abord une ligne « ### <Titre exact de la rubrique> », puis les puces, une par ligne, commençant par '- ', chaque puce = info datée + très courte explication + (Source : Nom — URL). Si une rubrique ne donne rien de fiable, mets « ### <Titre> » suivi de « - (pas d'actualité notable cette semaine) ».\n\nRubriques :\n" + ask }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: Math.min(10, items.length * 2) }],
    });
    const txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return txt || '';
  } catch (e) { console.error('fetchWebVeille:', e.message); return ''; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configuré' });

  const { data = {}, recipientName = '', ton = 'convivial', sections = {}, useWeb = true, crmUrl = '', kind = 'newsletter' } = req.body || {};

  const tonDesc = ton === 'fun'
    ? "très enjoué, complice, avec une pointe d'humour BTP (une petite blague/punchline), des emojis bien dosés"
    : ton === 'pro'
    ? 'professionnel et chaleureux, sobre, peu d\'emojis'
    : 'convivial, positif et motivant, emojis bien dosés';

  // ─ Variante « brief commercial personnel » ─
  if (kind === 'brief') {
    const sysB = [
      "Tu rédiges le BRIEF COMMERCIAL HEBDOMADAIRE PERSONNEL d'un commercial du groupe NOVAM Ingénierie (bureaux d'études techniques du bâtiment). C'est un email privé, adressé à UNE personne, sur SON portefeuille uniquement.",
      'Ton ' + tonDesc + ', motivant et orienté action (« voici ce qui compte pour toi cette semaine »). Tutoiement.',
      "Tu produis UNIQUEMENT le corps HTML (pas de <html>/<head>/<body>, pas de markdown, pas de ```). Tableaux + styles INLINE, largeur max 640px, police Arial/Helvetica. PALETTE NOVAM (violet) : bandeau dégradé linear-gradient(135deg,#7c3aed,#4c1d95) texte blanc ; accent/liens/boutons #7c3aed ; fonds doux #f5f0ff ; vert #10b981 / rouge #ef4444 / orange #f59e0b pour les statuts. Titres de section <h2> avec fine bordure basse grise.",
      "Structure (omets les sections vides) : 1) Salutation + « tes 3 priorités de la semaine » (déduis-les des données : gros dormant + devis chaud + signature à sécuriser). 2) Mon agenda : tâches à faire/en retard + signatures attendues. 3) Mes relances : devis à relancer, opportunités à requalifier, factures impayées. 4) Ma performance & objectifs : avancement objectif (barre de progression en HTML/CSS inline + %), pipeline perso, CA signé. 5) Mon portefeuille : nouveaux clients attribués, dormants à réveiller, alertes santé. 6) Un mot de motivation final (rang/badge si fourni).",
      "N'invente JAMAIS de chiffres : uniquement les données fournies. Pour la barre de progression objectif, utilise un <div> conteneur gris et un <div> intérieur violet dont la largeur = pourcentage.",
      crmUrl ? ('Ajoute un bouton CTA « Ouvrir mon CRM » (fond #7c3aed) vers ' + crmUrl + '.') : '',
      "Termine par « — NOVA, ton assistant CRM 🤖 » et une note discrète de désabonnement depuis Mon espace.",
    ].filter(Boolean).join('\n');
    const userB = [
      'Rédige le brief en français pour : ' + (recipientName || 'le commercial') + '.',
      'DONNÉES (son périmètre) :', '```json', JSON.stringify(data).slice(0, 60000), '```',
    ].join('\n');
    try {
      const j = await callClaude(key, { model: MODEL, max_tokens: 5000, system: sysB, messages: [{ role: 'user', content: userB }] });
      const txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (!txt) return res.status(502).json({ error: 'Réponse IA vide' });
      return res.status(200).json({ html: txt.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim() });
    } catch (e) { console.error('brief-build:', e.message); return res.status(500).json({ error: e.message }); }
  }

  const sysParts = [
    "Tu es le rédacteur de l'infolettre hebdomadaire interne du CRM du groupe NOVAM Ingénierie (bureaux d'études techniques du bâtiment : structure, géotechnique/études de sol, VRD, fluides, environnement ; entités GPH, REGAR/GPH-R, SERBA, GRAVITY, ECTS, EXECOME, etc., dans le Grand Ouest).",
    "Tu écris une newsletter destinée aux collaborateurs commerciaux, à lire le lundi matin. Objectif : donner envie de se connecter au CRM.",
    'Ton : ' + tonDesc + '.',
    "Tu produis UNIQUEMENT le corps HTML de l'email (pas de <html>/<head>/<body>, pas de balises markdown, pas de ``` ). HTML email compatible : tableaux et styles INLINE uniquement, largeur max 640px, police Arial/Helvetica. PALETTE OBLIGATOIRE inspirée de la charte NOVAM (violet/mauve) : bandeau d'en-tête en dégradé violet linear-gradient(135deg,#7c3aed,#4c1d95) texte blanc ; accent/liens/boutons #7c3aed ; violet clair pour fonds doux #f5f0ff ; violet secondaire #8b5cf6 ; vert #10b981, rouge #ef4444, orange #f59e0b pour les statuts uniquement. Titres de section en <h2 style=...> avec une fine bordure basse grise. Bouton CTA « Ouvrir le CRM » en fond #7c3aed. Pas de JavaScript, pas d'images externes obligatoires (emojis autorisés).",
    "Structure souple selon les données fournies : édito de bienvenue personnalisé, météo du pipeline, analyses clés, top client par agence, opportunités, marchés publics travaux (bâtiment & environnement), nouveaux clients, clients dormants à réveiller, nouveaux concurrents, un bloc « 🌐 Veille externe » regroupant les rubriques web fournies, agenda à venir, et si pertinent un podium/classement et les fêtes/anniversaires.",
    "N'invente JAMAIS de chiffres : utilise seulement les données fournies. Si une section est vide, soit tu l'omets, soit tu mets une phrase légère. Les montants sont en euros HT.",
    crmUrl ? ("Ajoute des boutons d'appel à l'action « Ouvrir le CRM » pointant vers " + crmUrl + " (encourage la connexion).") : '',
    "Termine par une signature légère « — NOVA, votre assistant CRM 🤖 » et une note discrète « Vous pouvez vous désabonner depuis Mon espace dans le CRM ».",
  ].filter(Boolean);

  // Étape 1 : recherche web (rubriques sélectionnées) — séparée pour fiabilité + mise en forme propre
  const selectedRubriques = Object.keys(WEB_RUBRIQUES).filter(k => sections[k] !== false);
  let veille = '';
  if (useWeb && selectedRubriques.length) veille = await fetchWebVeille(key, selectedRubriques);

  const userPrompt = [
    "Voici les données agrégées de la semaine (JSON). Rédige l'infolettre en français.",
    recipientName ? ('Destinataire : ' + recipientName + ' (salue-le/la par son prénom).') : '',
    veille
      ? "Bloc « 🌐 Veille externe » : METS EN FORME en HTML les faits de veille ci-dessous. Ils sont groupés par rubrique (chaque rubrique commence par une ligne « ### Titre »). Pour CHAQUE rubrique : un sous-titre <h3 style=\"font-size:14px;margin:14px 0 4px;color:#4c1d95\">Titre</h3> puis une liste <ul><li> ; transforme chaque « (Source : Nom — URL) » en lien <a href=\"URL\" style=\"color:#7c3aed\">Nom</a>. Ignore les rubriques marquées « pas d'actualité notable ». N'invente aucun chiffre.\nFAITS DE VEILLE :\n" + veille
      : "Pas de données de veille web disponibles : OMETS le bloc veille externe (pas de texte générique).",
    'Sections activées (true = inclure) : ' + JSON.stringify(sections),
    'DONNÉES :',
    '```json',
    JSON.stringify(data).slice(0, 60000),
    '```',
  ].filter(Boolean).join('\n');

  // Étape 2 : génération HTML (sans outil → sortie propre et déterministe)
  const body = {
    model: MODEL,
    max_tokens: 6000,
    system: sysParts.join('\n'),
    messages: [{ role: 'user', content: userPrompt }],
  };

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
