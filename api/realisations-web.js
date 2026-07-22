// Recherche web des RÉALISATIONS d'un client (chantiers, projets, références) via Claude + web_search.
// Couvre notamment le PRIVÉ que le DECP (marchés publics) ne voit pas.
//
// Appel : POST /api/realisations-web  { name, city, siren, sector, dept }
// Variable d'environnement (Vercel) : ANTHROPIC_API_KEY

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

  const { name = '', city = '', siren = '', sector = '', dept = '' } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name manquant' });

  const ctx = [String(name).trim(), sector && ('secteur : ' + sector), city && ('à ' + city), dept && ('dépt ' + dept), siren && ('SIREN ' + siren)].filter(Boolean).join(' — ');
  const system = "Tu es un analyste commercial d'un bureau d'études techniques du bâtiment (groupe NOVAM Ingénierie). Tu DOIS utiliser l'outil de recherche web pour trouver des informations FACTUELLES et RÉCENTES sur une entreprise et ses réalisations de construction (y compris projets privés). N'invente RIEN : uniquement ce que tu trouves réellement, avec la source. Si tu ne trouves pas grand-chose, dis-le honnêtement plutôt que d'inventer.";
  const userPrompt = [
    'Recherche sur le web les RÉALISATIONS et PROJETS de construction de l\'entreprise suivante : ' + ctx + '.',
    'Cible en priorité : sa page « réalisations / références », la presse pro (Le Moniteur, Batiactu…), LinkedIn, et toute mention de chantiers.',
    '',
    'Restitue en HTML simple (pas de <html>/<head>/<body>, pas de ```; styles inline légers, police héritée). Structure :',
    '<p> une phrase de présentation (activité, taille, zone d\'intervention).',
    '<h4> Réalisations / chantiers notables</h4> puis une liste <ul> : <b>nom du projet</b> · lieu · année (si connue) · type de bâtiment · rôle de l\'entreprise.',
    '<h4> Partenaires / écosystème</h4> : architectes, promoteurs, entreprises, maîtres d\'ouvrage récurrents si identifiables.',
    '<h4> À retenir pour la prospection</h4> : 2 à 3 puces.',
    'Termine par <p style="font-size:11px;color:#888"> <b>Sources :</b> puis les liens (balises <a>) réellement utilisés.',
    'En français. Reste factuel et concis.',
  ].join('\n');

  const messages = [{ role: 'user', content: userPrompt }];
  try {
    let text = '';
    for (let i = 0; i < 5; i++) {
      const j = await callClaude(key, {
        model: MODEL, max_tokens: 3000,
        system,
        messages,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      });
      const t = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (t) text += (text ? '\n' : '') + t;
      if (j.stop_reason === 'pause_turn' && Array.isArray(j.content)) { messages.push({ role: 'assistant', content: j.content }); continue; }
      break;
    }
    text = text.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
    if (!text) return res.status(502).json({ error: 'Réponse IA vide' });
    return res.status(200).json({ html: text });
  } catch (e) {
    console.error('realisations-web:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
