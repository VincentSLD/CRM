export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { action, text, clientName } = req.body || {};
  if (!text || !action) return res.status(400).json({ error: 'Missing action or text' });

  const prompts = {
    rewrite: `Tu es un assistant commercial. Reformule le compte-rendu suivant de manière professionnelle, claire et structurée. Garde le même sens mais améliore la rédaction, la syntaxe et la fluidité. Réponds uniquement avec le texte reformulé en HTML (utilise <strong>, <br>, <ul><li> si pertinent).

Compte-rendu :
${text}`,

    summarize: `Tu es un assistant commercial. Fais une synthèse concise du compte-rendu suivant sous forme de points clés (bullet points). Mets en avant les décisions prises, les actions à mener et les points importants. Réponds en HTML avec des <ul><li> et du <strong> pour les éléments clés.

Compte-rendu :
${text}`,

    complete: `Tu es un assistant commercial. À partir du compte-rendu ci-dessous, propose un complément pertinent : conclusion, prochaines étapes, points de vigilance ou recommandations. Réponds en HTML (utilise <strong>, <br>, <ul><li> si pertinent). Ne répète pas le contenu existant.

Compte-rendu :
${text}`
  };

  const systemPrompt = `Tu es un assistant IA intégré dans un CRM commercial. Tu aides les commerciaux à rédiger et améliorer leurs comptes-rendus de rendez-vous.${clientName ? ` Le client concerné est : ${clientName}.` : ''} Réponds toujours en français, de manière professionnelle et concise. Réponds uniquement avec le contenu HTML demandé, sans introduction ni commentaire.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompts[action] || prompts.rewrite }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'Anthropic API error', details: err });
    }

    const data = await response.json();
    const result = data.content?.[0]?.text || '';
    return res.status(200).json({ result });
  } catch (e) {
    console.error('AI proxy error:', e);
    return res.status(500).json({ error: e.message });
  }
}
