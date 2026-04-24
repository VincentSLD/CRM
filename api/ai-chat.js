// ═══ CHATBOT IA AVEC ACCÈS SUPABASE (tool use) ═══
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdWNjbml5b2Z6dndnb294amFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDQyNjgsImV4cCI6MjA4ODQ4MDI2OH0.dPerW1BApAxe26xzv9i7oWIubgGuzO5RibMvs-MFm88';

// Outils que l'IA peut utiliser pour interroger Supabase
const TOOLS = [
  {
    name: 'query_table',
    description: 'Interroger une table Supabase avec filtres. Retourne les lignes. Les tables disponibles sont: clients, contacts, devis, commandes, factures, affaires, marches, reports, commerciaux.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string', enum: ['clients','contacts','devis','commandes','factures','affaires','marches','reports','commerciaux'] },
        select: { type: 'string', description: 'Colonnes séparées par virgule, ex: "id,name,ca". * pour toutes.', default: '*' },
        filters: { type: 'object', description: 'Filtres. Clés: colonne.op (eq,neq,gt,gte,lt,lte,like,ilike,in,is). Ex: {"statut.eq":"retard","date.gte":"2024-01-01","name.ilike":"%rubato%"}' },
        order: { type: 'string', description: 'Colonne de tri, préfixer par "-" pour DESC. Ex: "-date"' },
        limit: { type: 'integer', default: 50, maximum: 200 }
      },
      required: ['table']
    }
  },
  {
    name: 'aggregate_table',
    description: 'Calcule une agrégation (somme, moyenne, nombre) sur une table avec filtres et groupement. Utile pour CA, montants totaux, etc.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string', enum: ['devis','commandes','factures','clients'] },
        column: { type: 'string', description: 'Colonne numérique à agréger (ex: montant)' },
        op: { type: 'string', enum: ['sum','avg','count','max','min'] },
        filters: { type: 'object', description: 'Mêmes filtres que query_table' },
        group_by: { type: 'string', description: 'Grouper par (ex: societe, statut, client_name). Retourne une liste avec group et value.' }
      },
      required: ['table','op']
    }
  }
];

async function sbRequest(path, options = {}) {
  const url = SUPABASE_URL + '/rest/v1/' + path;
  const resp = await fetch(url, {
    ...options,
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json', ...options.headers }
  });
  if (!resp.ok) throw new Error('Supabase error ' + resp.status + ': ' + await resp.text());
  return resp.json();
}

function buildQueryParams(filters, select, order, limit) {
  const params = new URLSearchParams();
  if (select) params.set('select', select);
  if (filters && typeof filters === 'object') {
    for (const [k, v] of Object.entries(filters)) {
      const [col, op] = k.split('.');
      if (!col || !op) continue;
      params.append(col, op + '.' + v);
    }
  }
  if (order) {
    const desc = order.startsWith('-');
    const col = desc ? order.substring(1) : order;
    params.set('order', col + (desc ? '.desc' : '.asc'));
  }
  if (limit) params.set('limit', String(Math.min(limit, 200)));
  return params.toString();
}

async function executeTool(name, input) {
  try {
    if (name === 'query_table') {
      const { table, select = '*', filters, order, limit = 50 } = input || {};
      const qs = buildQueryParams(filters, select, order, limit);
      const data = await sbRequest(table + '?' + qs);
      return { ok: true, count: data.length, rows: data };
    }
    if (name === 'aggregate_table') {
      const { table, column, op, filters, group_by } = input || {};
      // Supabase REST ne supporte pas nativement les agrégations → on charge tout et on agrège en JS
      const selectCols = group_by ? [column, group_by].filter(Boolean).join(',') : (column || '*');
      const qs = buildQueryParams(filters, selectCols, null, 10000);
      const data = await sbRequest(table + '?' + qs);
      if (op === 'count' && !group_by) return { ok: true, result: data.length };
      if (group_by) {
        const groups = {};
        for (const row of data) {
          const g = row[group_by] || '—';
          if (!groups[g]) groups[g] = [];
          if (column) groups[g].push(Number(row[column] || 0));
          else groups[g].push(1);
        }
        const result = Object.entries(groups).map(([g, vals]) => {
          let v = 0;
          if (op === 'sum') v = vals.reduce((a,x)=>a+x,0);
          else if (op === 'avg') v = vals.reduce((a,x)=>a+x,0) / vals.length;
          else if (op === 'count') v = vals.length;
          else if (op === 'max') v = Math.max(...vals);
          else if (op === 'min') v = Math.min(...vals);
          return { group: g, value: v };
        }).sort((a,b) => b.value - a.value);
        return { ok: true, rows: result };
      }
      const vals = data.map(r => Number(r[column] || 0));
      let v = 0;
      if (op === 'sum') v = vals.reduce((a,x)=>a+x,0);
      else if (op === 'avg') v = vals.length ? vals.reduce((a,x)=>a+x,0) / vals.length : 0;
      else if (op === 'max') v = vals.length ? Math.max(...vals) : 0;
      else if (op === 'min') v = vals.length ? Math.min(...vals) : 0;
      return { ok: true, result: v, count: data.length };
    }
    return { ok: false, error: 'Unknown tool: ' + name };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function callClaude(ANTHROPIC_KEY, body) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Anthropic API ' + resp.status + ': ' + await resp.text());
  return resp.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { question, history } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Missing question' });

  const systemPrompt = `Tu es un assistant IA intégré dans un CRM commercial français utilisé par le groupe GPH (plusieurs agences : GPH-R, GPH64, GPH85, etc.).

RÈGLES STRICTES :
1. Tu DOIS utiliser les outils query_table et aggregate_table pour consulter les données Supabase avant de répondre à toute question factuelle.
2. Ne JAMAIS inventer de chiffres ou d'informations. Si tu n'as pas la donnée, demande ou dis-le.
3. Toutes tes réponses doivent s'appuyer sur les résultats des outils.
4. Enchaîne plusieurs appels d'outils si nécessaire pour répondre précisément.

Tables disponibles (schéma principal) :
- clients : id, name, code, akuiteo_id, city, siren, siret, ape, account_manager_id, account_manager_name, salesman_name, mk_categorie, mk_secteur, ca, obj, status, created_at
- contacts : id, client_id, nom, prenom, fonction, email, telephone, mobile, akuiteo_id
- devis : id, ref, akuiteo_id, client_id, client_name, sujet, montant, statut (pending/accepted/refused/sent/signed), date, projet, agence, societe, responsable_id, commercial_id, affaire_id, marche_id
- commandes : id, ref, akuiteo_id, client_id, client_name, nom, montant, statut (en_cours/livree/facturee/annulee), date, livraison, projet, agence, societe, description, surface_facturee, affaire_id, marche_id
- factures : id, ref, akuiteo_id, client_id, client_name, montant, reste_a_payer, statut (payee/attente/envoyee/retard), date, echeance, jours_retard, date_paiement, projet, agence, societe, type_facture, affaire_id, marche_id
- affaires : id, nom, code_projet, client_id, client_name, marche_id, agence, statut, date_debut, date_fin, montant, montant_ttc
- marches : id, ref, akuiteo_id, nom, client_id, client_name, agence, statut, date_debut, date_fin, montant, montant_ttc, nb_affaires
- reports : id, client_id, client_name, date, titre, type_cr, statut_cr, redacteur_id
- commerciaux : id, nom, email, akuiteo_manager_id, role

Opérateurs de filtre : eq (=), neq (≠), gt (>), gte (≥), lt (<), lte (≤), like (case sensitive), ilike (case insensitive, utilise % pour wildcards), in, is (pour null : "col.is" : "null")

Exemples :
- CA facturé 2024 : aggregate_table(table="factures", column="montant", op="sum", filters={"date.gte":"2024-01-01","date.lt":"2025-01-01"})
- Top clients par CA : aggregate_table(table="factures", column="montant", op="sum", group_by="client_name")
- Factures en retard > 10k€ : query_table(table="factures", filters={"statut.eq":"retard","montant.gt":10000}, order="-montant")
- Clients dans Vendée : query_table(table="clients", filters={"departement.eq":"Vendée"}, select="id,name,city")

Réponds en français, concis, avec des chiffres exacts issus des outils. Format monnaie : k€ ou M€ pour les grands nombres.

Date actuelle : ${new Date().toISOString().slice(0,10)}`;

  try {
    const messages = Array.isArray(history) ? history.slice(-10) : [];
    messages.push({ role: 'user', content: question });

    let iterations = 0;
    const MAX_ITER = 6;
    while (iterations < MAX_ITER) {
      iterations++;
      const data = await callClaude(ANTHROPIC_KEY, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        tools: TOOLS,
        messages
      });

      // Si l'IA veut utiliser des tools, on exécute et on reboucle
      if (data.stop_reason === 'tool_use') {
        const toolUses = data.content.filter(c => c.type === 'tool_use');
        messages.push({ role: 'assistant', content: data.content });
        const toolResults = [];
        for (const tu of toolUses) {
          const result = await executeTool(tu.name, tu.input);
          // Tronquer les résultats trop gros pour ne pas saturer l'IA
          const str = JSON.stringify(result);
          const truncated = str.length > 8000 ? str.substring(0, 8000) + '... [tronqué]' : str;
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: truncated });
        }
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Réponse finale
      const textBlock = data.content.find(c => c.type === 'text');
      const result = textBlock?.text || '';
      return res.status(200).json({ result });
    }
    return res.status(200).json({ result: 'Trop d\'itérations — reformulez votre question.' });
  } catch (e) {
    console.error('AI chat error:', e);
    return res.status(500).json({ error: e.message });
  }
}
