// Résumé + conclusions d'un rapport indexé (à la demande, pour la recherche géographique).
// Récupère les passages du document puis demande à Claude un résumé et les conclusions.
//
// Variables d'environnement : ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_ANON_KEY)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdWNjbml5b2Z6dndnb294amFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDQyNjgsImV4cCI6MjA4ODQ4MDI2OH0.dPerW1BApAxe26xzv9i7oWIubgGuzO5RibMvs-MFm88';

const SYS = "Tu es un ingénieur géotechnicien. À partir des extraits d'un rapport d'étude de sol, produis un résumé synthétique et les conclusions/recommandations clés (type de fondations préconisé, contraintes de sol, risques : retrait-gonflement argiles, liquéfaction, nappe, etc.). Base-toi uniquement sur le texte fourni. Réponds en JSON strict sans Markdown : {\"resume\": string (3 à 5 phrases, HTML simple <b>/<br> autorisé), \"conclusion\": string (conclusions et recommandations clés ; chaîne vide si absentes)}.";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée' });

  const { document_id } = req.body || {};
  if (!document_id) return res.status(400).json({ error: 'document_id manquant' });

  try {
    const cr = await fetch(SUPABASE_URL + '/rest/v1/ged_chunks?select=content,chunk_index&document_id=eq.' + encodeURIComponent(document_id) + '&order=chunk_index.asc&limit=40', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const chunks = await cr.json();
    if (!cr.ok) throw new Error('Supabase : ' + JSON.stringify(chunks));
    if (!Array.isArray(chunks) || !chunks.length) return res.status(200).json({ resume: '(aucun contenu indexé pour ce document)', conclusion: '' });

    const text = chunks.map(c => c.content).join('\n').slice(0, 30000);

    const ar = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYS,
        messages: [{ role: 'user', content: 'RAPPORT (extraits) :\n' + text }]
      })
    });
    const aj = await ar.json().catch(() => ({}));
    if (!ar.ok) throw new Error('Anthropic ' + ar.status + ': ' + (aj.error?.message || JSON.stringify(aj)));
    const txt = (aj.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = txt.replace(/```json|```/g, '').trim();
    let o;
    try { o = JSON.parse(cleaned); }
    catch (e) { o = { resume: txt || '(résumé indisponible)', conclusion: '' }; }
    return res.status(200).json(o);
  } catch (e) {
    console.error('ged-summary error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
