export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { action, text, clientName, glossary } = req.body || {};
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
${text}`,

    preprdv: `Tu es un assistant commercial expert. Voici l'historique des comptes-rendus précédents avec le client ${clientName || ''}.

Analyse cet historique et produis une préparation complète de RDV structurée en 3 parties.

**PARTIE 1 — RÉSUMÉ HISTORIQUE**
Résume brièvement l'historique de la relation (sujets abordés, décisions prises, points en attente, opportunités, risques).

**PARTIE 2 — TRAME DE PRÉPARATION (réponds aux 6 questions)**
Pour chaque question, propose une réponse pré-remplie basée sur l'historique :
1. Pourquoi je suis là ? Quel motif commercial valable ?
2. Qu'est-ce que je veux savoir ? Quelles informations obtenir ?
3. Qu'est-ce que je veux échanger comme informations ?
4. Quelles sont les objections possibles ? Doutes ou incertitudes du client ?
5. Quels sont mes différenciateurs clés ? Et mes faiblesses critiques ?
6. Quels engagements d'actions prendre à la fin de l'entretien ?

**PARTIE 3 — QUESTIONS À POSER AU CLIENT**
Propose 5 à 10 questions pertinentes à poser lors du RDV, en lien avec l'historique et les enjeux identifiés.

Réponds en HTML structuré. Utilise <h4> pour les titres de parties, <strong> pour les questions, <ul><li> pour les listes. Sois concis et orienté action.

Historique des CR :
${text}`,

    transcribe_cr: `Tu es un assistant commercial. Voici la transcription d'une conversation téléphonique avec ${clientName || 'un client'}.

Produis un compte-rendu professionnel structuré de cet appel :
- **Objet de l'appel** : résume le motif principal
- **Points abordés** : liste les sujets discutés
- **Décisions prises** : si applicable
- **Actions à mener** : prochaines étapes identifiées
- **Notes** : informations complémentaires importantes

Réponds en HTML structuré (utilise <strong>, <ul><li>, <br>). Sois concis et factuel, ne rajoute pas d'informations inventées.

Transcription :
${text}`,

    correct_dictation: `Tu es un correcteur de transcription vocale. Corrige le texte dicté ci-dessous en te basant sur le glossaire fourni.

RÈGLES STRICTES :
- Corrige UNIQUEMENT les erreurs de reconnaissance vocale (noms propres mal transcrits, acronymes, termes techniques)
- Ne reformule PAS les phrases, garde le style oral tel quel
- Ne rajoute PAS de ponctuation excessive, juste les points et virgules évidents
- Si un mot ressemble phonétiquement à un terme du glossaire, remplace-le par le terme correct
- Réponds UNIQUEMENT avec le texte corrigé en texte brut, sans commentaire, sans balise HTML

GLOSSAIRE (noms de sociétés et termes à respecter) :
${glossary || '(aucun)'}

Texte à corriger :
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
        max_tokens: (action === 'preprdv' || action === 'transcribe_cr') ? 2048 : 1024,
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
    let result = data.content?.[0]?.text || '';
    // Nettoyer les blocs markdown ```html ... ``` que Claude ajoute parfois
    result = result.replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    return res.status(200).json({ result });
  } catch (e) {
    console.error('AI proxy error:', e);
    return res.status(500).json({ error: e.message });
  }
}
