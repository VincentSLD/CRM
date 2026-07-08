// Rédige un brouillon d'email de sollicitation d'un compte client/prospect pour une opportunité.
// L'utilisateur l'édite ensuite et l'envoie via /api/graph-send (depuis sa propre boîte).
//
// Entrée (POST JSON) : { client_name, opportunite_nom, ville, departement, adresse,
//                        commercial_nom, commercial_email, commercial_tel, contact_nom, ton }
// Sortie : { objet, corps }  (corps = HTML simple : <p>, <br>)
//
// Variables d'environnement : ANTHROPIC_API_KEY

const SYSTEM = "Tu rédiges des emails commerciaux B2B pour le groupe GPH / NOVAM (bureau d'études en géotechnique, structure et ingénierie du bâtiment, France). "
  + "Objectif : proposer à une société (client ou prospect) de travailler avec nous sur une opportunité/affaire précise. "
  + "Ton professionnel, chaleureux et concret, jamais racoleur. Court (4 à 8 phrases). "
  + "Structure : accroche personnalisée → ce que nous proposons pour cette opportunité → proposition d'échange (appel/RDV) → signature du commercial. "
  + "N'invente aucun chiffre, date ou engagement. Écris en français. "
  + "Réponds STRICTEMENT en JSON sans Markdown : {\"objet\": string, \"corps\": string}. "
  + "Le corps est en HTML simple (balises <p> et <br> uniquement, pas de style).";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée' });

  const b = req.body || {};
  const ctx = [
    b.client_name ? `Société à solliciter : ${b.client_name}` : '',
    b.contact_nom ? `Interlocuteur : ${b.contact_nom}` : '',
    b.opportunite_nom ? `Opportunité / affaire concernée : ${b.opportunite_nom}` : '',
    (b.ville || b.departement) ? `Localisation du chantier : ${[b.ville, b.departement && ('dép. ' + b.departement)].filter(Boolean).join(', ')}` : '',
    b.adresse ? `Adresse chantier : ${b.adresse}` : '',
    b.commercial_nom ? `Commercial signataire : ${b.commercial_nom}` : '',
    b.commercial_email ? `Email du commercial : ${b.commercial_email}` : '',
    b.commercial_tel ? `Téléphone du commercial : ${b.commercial_tel}` : '',
    b.ton ? `Ton souhaité : ${b.ton}` : '',
  ].filter(Boolean).join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: SYSTEM,
        messages: [{ role: 'user', content: "Rédige l'email de sollicitation à partir de ces éléments :\n\n" + ctx }]
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (j.error?.message || JSON.stringify(j)));
    const txt = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').replace(/```json|```/g, '').trim();
    let o;
    try { o = JSON.parse(txt); } catch (e) { o = { objet: b.opportunite_nom ? ('Proposition de collaboration — ' + b.opportunite_nom) : 'Proposition de collaboration', corps: '<p>' + txt.replace(/\n/g, '<br>') + '</p>' }; }
    if (!o.objet) o.objet = b.opportunite_nom ? ('Proposition de collaboration — ' + b.opportunite_nom) : 'Proposition de collaboration';
    if (!o.corps) o.corps = '<p></p>';
    return res.status(200).json(o);
  } catch (e) {
    console.error('sollicitation-mail error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
