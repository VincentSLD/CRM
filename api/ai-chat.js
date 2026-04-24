export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { question, context, history } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Missing question' });

  const systemPrompt = `Tu es un assistant IA intégré dans un CRM commercial français utilisé par le groupe GPH (plusieurs agences : GPH-R, GPH64, GPH85, etc.). Tu aides les commerciaux et managers à analyser leurs données (clients, devis, commandes, factures, affaires, marchés).

Tu as accès à un résumé des données actuelles du CRM (ci-dessous). Réponds aux questions de l'utilisateur de manière concise, factuelle et orientée action. Utilise les chiffres fournis. Si une information manque, dis-le clairement.

Format : texte court et clair, avec des puces si pertinent. Montants en euros (utilise k€/M€ pour les grands nombres). Réponds toujours en français.

=== CONTEXTE CRM ===
${context || '(aucun contexte fourni)'}`;

  try {
    const messages = Array.isArray(history) ? history.slice(-10) : [];
    messages.push({ role: 'user', content: question });

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
        messages
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
    console.error('AI chat error:', e);
    return res.status(500).json({ error: e.message });
  }
}
