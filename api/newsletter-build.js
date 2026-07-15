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
  agenda_pro: { label: 'Agenda salons & événements', query: "prochains salons et événements professionnels du BTP / géotechnique À VENIR en France (dates FUTURES uniquement) : BATIMAT, Salon des Maires, congrès, journées techniques. Exclure tout événement déjà passé, indiquer la date de chaque événement." },
};

// Contexte de fraîcheur : « aujourd'hui » et « il y a un mois » (pour cadrer la recherche web).
function veilleCtx(previousWeb) {
  const now = new Date();
  const fmt = d => d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'long', year: 'numeric' });
  const since = new Date(now.getTime() - 31 * 864e5);
  // Liste des infos déjà diffusées (extraites des puces des éditions précédentes) → à ne pas répéter.
  const seen = [];
  (previousWeb || []).forEach(txt => veilleBullets(txt).forEach(b => { if (b && !seen.includes(b)) seen.push(b); }));
  return { today: fmt(now), since: fmt(since), exclude: seen.slice(0, 60) };
}
// Extrait les puces factuelles d'un texte de veille (sans la source, tronquées) → pour la déduplication.
function veilleBullets(text) {
  if (!text) return [];
  return String(text).split('\n').map(l => l.trim()).filter(l => /^[-•*]\s+/.test(l))
    .map(l => l.replace(/^[-•*]\s+/, '').replace(/\(\s*Sources?\s*:.*$/i, '').trim())
    .filter(b => b && !/pas d['’]actualit/i.test(b)).map(b => b.slice(0, 140));
}
// Recherche web pour les rubriques sélectionnées → texte groupé par rubrique (### Titre + puces avec sources).
// Étape séparée pour fiabiliser (toujours appelée) et permettre une mise en forme propre ensuite.
// Un lot de rubriques (≤ 3) → un appel web. Découpé pour que les résultats web n'épuisent
// pas le budget de tokens avant la synthèse (cause de veille vide quand beaucoup de rubriques).
async function fetchWebVeilleChunk(key, items, ctx) {
  const ask = items.map((it, i) => `${i + 1}. « ${it.label} » : ${it.query}`).join('\n');
  const excludeBlock = (ctx.exclude && ctx.exclude.length)
    ? "ATTENTION — les informations suivantes ont DÉJÀ été diffusées dans de précédentes infolettres. Ne les répète surtout PAS, apporte uniquement du NOUVEAU :\n" + ctx.exclude.map(e => '• ' + e).join('\n') + "\n\n"
    : '';
  const content = "Nous sommes le " + ctx.today + ". Recherche sur le web (sources françaises) UNIQUEMENT des informations RÉCENTES : datées de MOINS D'UN MOIS (depuis le " + ctx.since + "). Ignore et n'affiche RIEN de plus ancien.\n"
    + "Privilégie la FRAÎCHEUR à la quantité : 1 à 2 puces MAXIMUM par rubrique, factuelles, datées, avec source. Mieux vaut une seule info très récente que plusieurs tièdes.\n"
    + "Pour toute rubrique de type agenda / salons / événements : uniquement des événements À VENIR (postérieurs au " + ctx.today + "), JAMAIS d'événements déjà passés ; indique leur date.\n"
    + excludeBlock
    + "Format STRICT, sans introduction ni conclusion : pour chaque rubrique, d'abord une ligne « ### <Titre exact de la rubrique> », puis les puces, une par ligne, commençant par '- ', chaque puce = info datée + très courte explication + (Source : Nom — URL). Si une rubrique n'a aucune actualité RÉCENTE et fiable, mets « ### <Titre> » suivi de « - (pas d'actualité récente) ».\n\nRubriques :\n" + ask;
  const messages = [{ role: 'user', content }];
  let text = '', stop = null;
  for (let i = 0; i < 5; i++) {
    const j = await callClaude(key, {
      model: MODEL, max_tokens: 4000,
      system: "Tu es un analyste de veille pour un bureau d'études du bâtiment en France. Tu DOIS utiliser l'outil de recherche web pour trouver des informations RÉCENTES (moins d'un mois) et FRANÇAISES. La fraîcheur prime sur le volume : n'affiche jamais une info que tu ne peux pas dater du mois écoulé.",
      messages,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    });
    stop = j.stop_reason;
    const t = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (t) text += (text ? '\n' : '') + t;
    if (j.stop_reason === 'pause_turn' && Array.isArray(j.content)) { messages.push({ role: 'assistant', content: j.content }); continue; }
    break;
  }
  return { text: text.trim(), stop };
}
async function fetchWebVeille(key, rubriqueKeys, ctx) {
  const items = (rubriqueKeys || []).map(k => WEB_RUBRIQUES[k] ? { k, ...WEB_RUBRIQUES[k] } : null).filter(Boolean);
  if (!items.length) return { text: '', error: null, stop: null };
  let text = '', stop = null, error = null;
  try {
    for (let i = 0; i < items.length; i += 3) {
      const r = await fetchWebVeilleChunk(key, items.slice(i, i + 3), ctx);
      if (r.text) text += (text ? '\n' : '') + r.text;
      stop = r.stop;
    }
  } catch (e) { console.error('fetchWebVeille:', e.message); error = e.message; }
  return { text: text.trim(), error, stop };
}

// Rendu HTML DÉTERMINISTE du bloc veille (on ne confie pas la mise en forme au modèle → présence garantie)
function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function renderVeilleHtml(text) {
  if (!text) return '';
  const linkify = s => s.replace(/\(\s*Sources?\s*:\s*(.+?)\s*[—–\-]+\s*(https?:\/\/[^\s)]+)\s*\)/gi, '(<a href="$2" style="color:#7c3aed">$1</a>)');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let html = '', any = false, title = null, buf = [];
  const flush = () => {
    if (title) {
      const real = buf.filter(b => !/pas d['’]actualit/i.test(b));
      if (real.length) {
        any = true;
        html += '<div style="background:#f5f0ff;border-radius:8px;padding:10px 14px;margin:0 0 8px">'
          + '<div style="font-weight:700;font-size:13px;color:#5b21b6;margin-bottom:5px">' + _esc(title) + '</div>'
          + '<ul style="margin:0;padding-left:18px;font-size:13px;color:#444;line-height:1.55">'
          + real.map(b => '<li style="margin:3px 0">' + linkify(_esc(b)) + '</li>').join('')
          + '</ul></div>';
      }
    }
    title = null; buf = [];
  };
  for (const l of lines) {
    if (/^#{2,}\s*/.test(l)) { flush(); title = l.replace(/^#{2,}\s*/, ''); }
    else if (/^[-•*]\s+/.test(l)) { buf.push(l.replace(/^[-•*]\s+/, '').trim()); }
    else if (title) { buf.push(l); }
  }
  flush();
  if (!any) return '';
  return '<h2 style="font-size:17px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #ede9fe;padding-bottom:6px;color:#1a1a1a">🌐 Veille externe</h2>' + html;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configuré' });

  const { data = {}, recipientName = '', ton = 'convivial', sections = {}, useWeb = true, crmUrl = '', kind = 'newsletter', previousWeb = [] } = req.body || {};

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
  let veille = '', webErr = null, webStop = null;
  if (useWeb && selectedRubriques.length) { const wr = await fetchWebVeille(key, selectedRubriques, veilleCtx(previousWeb)); veille = wr.text; webErr = wr.error; webStop = wr.stop; }

  const veilleHtml = renderVeilleHtml(veille);
  const userPrompt = [
    "Voici les données agrégées de la semaine (JSON). Rédige l'infolettre en français.",
    recipientName ? ('Destinataire : ' + recipientName + ' (salue-le/la par son prénom).') : '',
    veilleHtml
      ? "IMPORTANT : ne rédige PAS toi-même le bloc « Veille externe ». Insère EXACTEMENT le marqueur <!--VEILLE--> sur sa propre ligne, après les sections CRM et AVANT la signature finale. Ce bloc sera injecté automatiquement."
      : "Pas de bloc veille externe.",
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
    let clean = html.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
    // Injection déterministe du bloc veille (présence garantie)
    if (veilleHtml) {
      if (clean.includes('<!--VEILLE-->')) clean = clean.replace('<!--VEILLE-->', veilleHtml);
      else { const sig = clean.search(/—\s*NOVA/); clean = sig > -1 ? clean.slice(0, sig) + veilleHtml + clean.slice(sig) : clean + veilleHtml; }
    } else { clean = clean.replace('<!--VEILLE-->', ''); }
    return res.status(200).json({ html: clean, web: { rubriques: selectedRubriques.length, chars: veille.length, rendered: veilleHtml.length, error: webErr, stop: webStop, veilleRaw: veille } });
  } catch (e) {
    console.error('newsletter-build:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
