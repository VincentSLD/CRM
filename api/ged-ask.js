// Interrogation de la base documentaire (RAG) :
//  1. embedding de la question (OpenAI)
//  2. recherche des passages les plus proches (Supabase / pgvector, fonction ged_match)
//  3. réponse de Claude basée uniquement sur ces passages
//
// Variables d'environnement requises (Vercel) :
//   OPENAI_API_KEY, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_ANON_KEY)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdWNjbml5b2Z6dndnb294amFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDQyNjgsImV4cCI6MjA4ODQ4MDI2OH0.dPerW1BApAxe26xzv9i7oWIubgGuzO5RibMvs-MFm88';

async function embedQuestion(key, text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('OpenAI ' + r.status + ': ' + (j.error?.message || JSON.stringify(j)));
  return j.data[0].embedding;
}

const SYSTEM_PROMPT = "Tu es un assistant documentaire expert pour un bureau d'études en géotechnique et ingénierie du bâtiment (groupe GPH). Tu analyses des documents techniques avec rigueur.\n\nFONCTIONNEMENT (à comprendre absolument) :\n- La base documentaire complète contient de nombreux documents (le nombre total exact t'est donné dans le message). À chaque question, on ne te transmet qu'un SOUS-ENSEMBLE d'extraits : les passages jugés les plus pertinents par une recherche sémantique. Ce ne sont donc PAS tous les documents.\n- Tu ne dois JAMAIS déduire le nombre total de documents/rapports à partir du nombre d'extraits fournis. Pour toute question de quantité, d'inventaire ou de comptage portant sur l'ensemble de la base (« combien de rapports », « combien de documents », « liste tous les… »), appuie-toi UNIQUEMENT sur le nombre total indiqué dans le message, et précise que ce total correspond à l'ensemble des documents indexés.\n\nRÈGLES :\n- Pour les questions de CONTENU, base tes réponses UNIQUEMENT sur les extraits fournis. Ne jamais inventer ou supposer des informations absentes des extraits.\n- Sois précis : va droit au but, cite les passages ou données clés et le nom du document source.\n- Analyse critique : signale toute erreur, incohérence, contradiction ou contre-indication détectée (valeurs contradictoires, normes non respectées, données manquantes critiques).\n- Si l'information de contenu demandée ne figure pas dans les extraits, dis-le clairement : le document pertinent n'a peut-être pas été remonté par la recherche — invite alors à préciser la question (nom de client, référence, commune…) pour mieux cibler.\n\nRéponds en JSON strict sans Markdown : {\"reponse\": string (HTML simple autorisé: <b>, <br>, <ul><li>, <h4>), \"sources\": string[] (noms exacts des documents utilisés), \"confiance\": number 0-100, \"alertes\": string[] (erreurs/incohérences détectées, tableau vide si aucune)}.";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!OPENAI_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY non configurée' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée' });

  const { question, match_count } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Question manquante' });

  try {
    // 0. Nombre total de documents indexés (pour les questions de quantité/inventaire)
    let totalDocs = null;
    try {
      const cr = await fetch(SUPABASE_URL + '/rest/v1/ged_documents?select=id&limit=1', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'count=exact' }
      });
      const range = cr.headers.get('content-range'); // ex. "0-0/2967"
      if (range && range.includes('/')) totalDocs = parseInt(range.split('/')[1], 10);
    } catch (e) {}

    // 1. Embedding de la question
    const emb = await embedQuestion(OPENAI_KEY, question);

    // 2. Recherche des passages proches (pgvector)
    const mr = await fetch(SUPABASE_URL + '/rest/v1/rpc/ged_match', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query_embedding: '[' + emb.join(',') + ']', match_count: Math.min(match_count || 12, 30) })
    });
    const chunks = await mr.json();
    if (!mr.ok) throw new Error('Recherche Supabase : ' + JSON.stringify(chunks));
    if (!Array.isArray(chunks) || !chunks.length) {
      return res.status(200).json({ reponse: "Aucun document pertinent trouvé dans la base indexée pour cette question.", sources: [], confiance: 0, alertes: [] });
    }

    // 3. Construction du contexte + appel Claude
    const context = chunks.map(c => `[Document : ${c.name} — ${c.path}]\n${c.content}`).join('\n\n---\n\n');
    const baseInfo = (totalDocs != null)
      ? `INFORMATION SUR LA BASE : elle contient au total ${totalDocs} document(s) indexé(s). Les extraits ci-dessous n'en sont qu'un sous-ensemble pertinent.\n\n`
      : '';
    const userMsg = baseInfo + "EXTRAITS DE DOCUMENTS (les plus pertinents trouvés dans la base, sous-ensemble du total) :\n\n" + context + "\n\nQUESTION : " + question;

    const ar = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }]
      })
    });
    const aj = await ar.json().catch(() => ({}));
    if (!ar.ok) throw new Error('Anthropic ' + ar.status + ': ' + (aj.error?.message || JSON.stringify(aj)));

    const txt = (aj.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = txt.replace(/```json|```/g, '').trim();
    let o;
    try { o = JSON.parse(cleaned); }
    catch (e) { o = { reponse: txt || 'Pas de réponse.', sources: [], confiance: 0, alertes: [] }; }

    // Documents réellement remontés par la recherche (pour information)
    o.matched = [...new Set(chunks.map(c => c.name))];
    return res.status(200).json(o);
  } catch (e) {
    console.error('ged-ask error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
