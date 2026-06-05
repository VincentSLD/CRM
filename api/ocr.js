export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { image, media_type, filename } = req.body || {};
  if (!image || !media_type) return res.status(400).json({ error: 'Missing image or media_type' });

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
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type, data: image }
            },
            {
              type: 'text',
              text: "Extrais tout le texte visible dans cette image. Retourne uniquement le texte brut, fidèlement, sans commentaire ni mise en forme. Si c'est un tableau, restitue-le ligne par ligne. Si l'image ne contient pas de texte lisible, réponds uniquement : [Aucun texte détecté]"
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic Vision API error:', err);
      return res.status(502).json({ error: 'Anthropic API error', details: err });
    }

    const data = await response.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return res.status(200).json({ text, filename });
  } catch (e) {
    console.error('OCR proxy error:', e);
    return res.status(500).json({ error: e.message });
  }
}
