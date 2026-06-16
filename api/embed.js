// Génère des embeddings OpenAI (text-embedding-3-small, 1536 dimensions).
// Utilisé par le navigateur lors de l'indexation de la base documentaire (GED).
//
// Variable d'environnement requise (Vercel) : OPENAI_API_KEY

export const config = { api: { bodyParser: { sizeLimit: '6mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const KEY = process.env.OPENAI_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'OPENAI_API_KEY non configurée' });

  const { texts } = req.body || {};
  if (!Array.isArray(texts) || !texts.length) return res.status(400).json({ error: 'Champ "texts" manquant' });
  if (texts.length > 100) return res.status(400).json({ error: 'Max 100 textes par lot' });

  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texts })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('OpenAI embeddings error:', r.status, JSON.stringify(j));
      return res.status(502).json({ error: 'OpenAI ' + r.status, details: j.error?.message || JSON.stringify(j) });
    }
    const embeddings = (j.data || []).slice().sort((a, b) => a.index - b.index).map(d => d.embedding);
    return res.status(200).json({ embeddings });
  } catch (e) {
    console.error('Embed error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
