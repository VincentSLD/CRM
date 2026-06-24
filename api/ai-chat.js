// ═══ CHATBOT IA AVEC ACCÈS SUPABASE (tool use) + STREAMING SSE ═══
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdWNjbml5b2Z6dndnb294amFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDQyNjgsImV4cCI6MjA4ODQ4MDI2OH0.dPerW1BApAxe26xzv9i7oWIubgGuzO5RibMvs-MFm88';

// Outils que l'IA peut utiliser pour interroger Supabase
const TOOLS = [
  {
    name: 'query_table',
    description: 'Interroger une table Supabase avec filtres. Retourne les lignes. Les tables disponibles sont: clients, contacts, devis, commandes, factures, affaires, marches, reports, commerciaux, taches_commerciales, opportunites.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string', enum: ['clients','contacts','devis','commandes','factures','affaires','marches','reports','commerciaux','taches_commerciales','opportunites'] },
        select: { type: 'string', description: 'Colonnes séparées par virgule, ex: "id,name,ca". * pour toutes.', default: '*' },
        filters: { type: 'object', description: 'Filtres. Clés: colonne.op (eq,neq,gt,gte,lt,lte,like,ilike,in,is). Ex: {"statut.eq":"retard","date.gte":"2024-01-01","name.ilike":"%rubato%"}' },
        order: { type: 'string', description: 'Colonne de tri, préfixer par "-" pour DESC. Ex: "-date"' },
        limit: { type: 'integer', default: 50, maximum: 200 }
      },
      required: ['table']
    }
  },
  {
    name: 'search_clients',
    description: "Recherche TOLÉRANTE d'un client/prospect par nom : insensible à la ponctuation, aux espaces, à la casse ET aux fautes de frappe (recherche par trigrammes). À utiliser EN PRIORITÉ pour retrouver une société quand le nom exact est incertain : dictée vocale approximative, abréviation (ex. \"6K\" → \"6.K ARCHI\"), nom partiel (ex. \"LT ARCHI\"). Retourne les meilleurs candidats classés par pertinence (champ score, 1=parfait). Récupère ensuite les détails complets avec query_table(table=\"clients\", filters={\"id.eq\":\"<id>\"}).",
    input_schema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Texte recherché : nom de société (partiel, abrégé, mal orthographié...)' },
        limit: { type: 'integer', default: 20, maximum: 50 }
      },
      required: ['q']
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

const TABLE_LABELS = { clients:'clients', contacts:'contacts', devis:'devis', commandes:'commandes', factures:'factures', affaires:'affaires', marches:'marchés', reports:'comptes-rendus', commerciaux:'commerciaux', taches_commerciales:'tâches commerciales', opportunites:'opportunités' };

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
    if (name === 'search_clients') {
      const { q, limit = 20 } = input || {};
      if (!q || !String(q).trim()) return { ok: false, error: 'q (texte recherché) requis' };
      const data = await sbRequest('rpc/search_clients', { method: 'POST', body: JSON.stringify({ q: String(q), lim: Math.min(limit || 20, 50) }) });
      return { ok: true, count: Array.isArray(data) ? data.length : 0, rows: data };
    }
    if (name === 'query_table') {
      const { table, select = '*', filters, order, limit = 50 } = input || {};
      const qs = buildQueryParams(filters, select, order, limit);
      const data = await sbRequest(table + '?' + qs);
      return { ok: true, count: data.length, rows: data };
    }
    if (name === 'aggregate_table') {
      const { table, column, op, filters, group_by } = input || {};
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

function toolLabel(tu) {
  const tbl = TABLE_LABELS[tu.input?.table] || tu.input?.table || 'données';
  if (tu.name === 'search_clients') return 'Recherche société « ' + (tu.input?.q || '') + ' »';
  if (tu.name === 'query_table') return 'Consultation ' + tbl;
  if (tu.name === 'aggregate_table') return 'Calcul sur ' + tbl;
  return tu.name;
}

function buildSystemPrompt(userProfile, glossary) {
  return `Tu t'appelles NOVA. Tu es une assistante IA féminine intégrée dans un CRM commercial français utilisé par le groupe GPH (plusieurs agences : GPH-R, GPH64, GPH85, SA85, etc.).
Tu es une analyste financière, commerciale et stratégique au service de l'entreprise. Tu parles au féminin (je suis ravie, j'ai trouvé, etc.).

DOMAINE MÉTIER — INGÉNIERIE DU BÂTIMENT :
Le groupe GPH est un bureau d'études techniques multi-métiers. Les domaines d'activité sont :
- Géotechnique / Études de sol : sondages, forages, essais pressiométriques, piézomètres, piézométrie, reconnaissance de sol, hydrogéologie, rabattement de nappe, fondations, micropieux, tirants d'ancrage, terrassement, remblais
- Structure / Gros œuvre : béton armé, charpente métallique, charpente bois, voiles, poteaux, poutres, dalles, prédimensionnement, notes de calcul, plans de coffrage, plans de ferraillage
- Thermique / Fluides : RT 2012, RE 2020, audit énergétique, DPE, chauffage, ventilation, climatisation, CVC, plomberie, SSI
- VRD (Voirie et Réseaux Divers) : assainissement, eau potable, voirie, réseaux secs, réseaux humides, aménagement extérieur
- Économie de la construction : métrés, quantitatifs, estimatifs, DPGF, CCTP, DCE, analyse des offres, OPC
- Paysage / Environnement : études d'impact, études écologiques, aménagements paysagers
- Topographie : levés, implantation, géoréférencement

MISSIONS NORMATIVES (NF P 94-500) — GÉOTECHNIQUE :
- G1 PGC : Étude géotechnique préalable — Phase Principes Généraux de Construction
- G1 ES : Étude de site (ancienne dénomination)
- G2 AVP : Étude géotechnique de conception — Phase Avant-Projet
- G2 PRO : Étude géotechnique de conception — Phase Projet (souvent dicté "jé deux pro")
- G2 DCE/ACT : Phase DCE et Assistance aux Contrats de Travaux
- G3 : Étude et suivi géotechnique d'exécution
- G4 : Supervision géotechnique d'exécution
- G5 : Diagnostic géotechnique

INTERPRÉTATION DE LA DICTÉE VOCALE :
Les questions peuvent provenir de la dictée vocale. La reconnaissance vocale fait souvent des erreurs sur les noms propres et les termes techniques. Exemples courants :
- "jé deux pro" ou "g2 pro" → G2 PRO (mission géotechnique)
- "jé un" → G1, "jé trois" → G3, "jé quatre" → G4, "jé cinq" → G5
- "ça tov" ou "sa tof" → chercher dans les noms de clients (ex: SATOV)
- "gépéache" ou "j p h" → GPH (le groupe)
- "novame" → Novam (filiale du groupe)
- "akuitéo" → Akuiteo (ERP du groupe)
- "codial" → CODIAL (ancien ERP)
- "précio-mètre" ou "piézaux-mètre" → piézomètre
- "pressiaux-métrique" → pressiométrique
Si un mot ne correspond à rien de connu, utilise l'outil search_clients (recherche tolérante par trigrammes) pour retrouver la société — il gère la ponctuation, les espaces, la casse et les fautes de frappe.
${glossary ? `\nGLOSSAIRE CLIENTS (noms à reconnaître en priorité) :\n${glossary}` : ''}

RÈGLES STRICTES :
1. Tu DOIS utiliser les outils query_table et aggregate_table pour consulter les données Supabase avant de répondre à toute question factuelle. Ne JAMAIS inventer de chiffres ou d'informations.
2. Toutes tes réponses doivent s'appuyer EXCLUSIVEMENT sur les données du CRM issues des outils. Si tu n'as pas la donnée, dis-le clairement.
3. Si tu estimes qu'une recherche externe (web, marché, concurrence) serait utile, DEMANDE d'abord l'autorisation à l'utilisateur avant de répondre. N'invente jamais de données externes.
4. Enchaîne plusieurs appels d'outils si nécessaire pour répondre précisément.
5. Sois TOUJOURS force de proposition : après avoir répondu à une question, propose des analyses complémentaires, des pistes d'action concrètes ou des alertes pertinentes.
6. Quand on te demande des infos sur une société ou un contact, cherche TOUJOURS dans le CRM d'abord. Pour retrouver une société par son nom, utilise EN PRIORITÉ l'outil search_clients (recherche tolérante) PLUTÔT qu'un query_table avec ilike : il retrouve la société même si le nom est abrégé, mal orthographié ou ponctué différemment (ex. "6K" → "6.K ARCHI"). Ne conclus JAMAIS qu'un client est absent de la base sans avoir essayé search_clients. Récupère ensuite ses contacts avec client_id et affiche TOUTES les coordonnées disponibles.
7. Quand tu affiches des coordonnées, utilise des liens HTML cliquables : <a href="mailto:email">email</a> pour les emails et affiche les numéros de téléphone en clair (ils seront automatiquement rendus cliquables par le CRM). Formate les numéros au format XX XX XX XX XX.

TON RÔLE STRATÉGIQUE :
- Analyse financière : CA, marges, évolutions, tendances, comparaisons inter-agences et inter-périodes, DSO, retards de paiement.
- Analyse commerciale : pipeline devis, taux de transformation, top clients, clients à risque (dormants), performance des commerciaux.
- Aide à la stratégie : segmentation clients (catégorisation ABC : A-Stratégique = 50% du CA, B-Tactique = 30%, C-Listé = 20%), détection de clients dormants à réactiver, concentration du portefeuille, diversification.
- Alertes proactives : quand tu détectes un risque (client stratégique en retard, baisse de CA, concentration excessive sur un client), signale-le.

STATUTS ET CATÉGORIES :
- status client : "actif" (facture < 6 mois et ancienneté > 6 mois), "nouveau" (première facture < 6 mois), "dormant" (toutes factures > 6 mois)
- categorie_compte : JSONB par agence, ex: {"GPH85":"A- Stratégique","SA85":"C- Listé"}. Valeurs possibles : "A- Stratégique", "B- Tactique", "C- Listé".

Tables disponibles (schéma principal) :
- clients : id, name, code, akuiteo_id, city, code_postal, departement, region, siren, siret, ape, forme_juridique, raison_sociale, raison_sociale2, account_manager_id, account_manager_name, salesman_name, commerciaux_associes, mk_categorie, mk_sous_categorie, mk_categorie_pro, mk_secteur, mk_type, mk_groupe, mk_origine, ca, obj, status (actif/nouveau/dormant), categorie_compte (JSONB), chiffre_affaires, effectif, capital, secteur_activite, procedure_collective, email, phone, telephone2, mobile, fax, site_web, created_at
- contacts : id, client_id, nom, prenom, fonction, service, email, email2, telephone, telephone2, mobile, akuiteo_id
- devis : id, ref, akuiteo_id, client_id, client_name, sujet, montant, statut (pending/accepted/refused/sent/signed), date, projet, agence, societe, responsable_id, commercial_id, probabilite, affaire_id, marche_id
- commandes : id, ref, akuiteo_id, client_id, client_name, nom, montant, statut (en_cours/livree/facturee/annulee), date, livraison, projet, agence, societe, surface_facturee, affaire_id, marche_id, description, custom_data (JSONB contenant _lines: tableau de lignes avec name, quantity, unitPrice, amountTotal, startDate, endDate, estimatedDeliveryDate, estimatedBillingDate, projectedBillingDate)
- factures : id, ref, akuiteo_id, client_id, client_name, montant, montant_ttc, reste_a_payer, statut (payee/attente/envoyee/retard), date, echeance, jours_retard, date_paiement, projet, agence, societe, type_facture, affaire_id, marche_id
- affaires : id, nom, code_projet, client_id, client_name, marche_id, agence, statut, date_debut, date_fin, montant, montant_ttc, departement, region
- marches : id, ref, akuiteo_id, nom, client_id, client_name, agence, statut, date_debut, date_fin, montant, montant_ttc, nb_affaires
- reports : id, client_id, client_name, date, titre, type_cr, statut_cr, redacteur_id, agence
- commerciaux : id, nom, email, akuiteo_manager_id, role
- taches_commerciales : id, titre, description, priorite (basse/normale/haute), statut (a_faire/en_cours/terminee/annulee), echeance, client_id, client_name, affaire_id, affaire_nom, createur_nom, createur_email, assigne_nom, assigne_email, created_at, done_at
- opportunites : id, akuiteo_id, code, nom, description, client_id, client_name, contact_name, montant, devise, probabilite (%), statut (IN_PROGRESS=en cours / WON=gagnée / LOST=perdue / DISCARD=abandonnée), stage (libellé du stade), pipe (portefeuille : Marchés privés/publics), type_origine, origine, responsable, date_signature (signature prévisionnelle), date_creation

Opérateurs de filtre : eq (=), neq (≠), gt (>), gte (≥), lt (<), lte (≤), like (case sensitive), ilike (case insensitive, utilise % pour wildcards), in, is (pour null : "col.is" : "null")

Exemples :
- CA facturé 2024 : aggregate_table(table="factures", column="montant", op="sum", filters={"date.gte":"2024-01-01","date.lt":"2025-01-01"})
- Top clients par CA : aggregate_table(table="factures", column="montant", op="sum", group_by="client_name")
- Factures en retard > 10k€ : query_table(table="factures", filters={"statut.eq":"retard","montant.gt":10000}, order="-montant")
- Clients dormants : query_table(table="clients", filters={"status.eq":"dormant"}, select="name,city,status,categorie_compte", order="name")
- Clients stratégiques d'une agence : query_table(table="clients", filters={"categorie_compte.cs":"{\\"GPH85\\":\\"A- Stratégique\\"}"}, select="name,city,categorie_compte")
- Chercher une société (TOLÉRANT, à privilégier) : search_clients(q="6K") → renvoie les candidats classés ; puis query_table(table="clients", filters={"id.eq":"<id du meilleur candidat>"}) pour les détails complets.
- Chercher une société (exact, si tu connais déjà le nom précis) : query_table(table="clients", filters={"name.ilike":"%rubato%"}, select="id,name,code,city,code_postal,ca,status,account_manager_name,salesman_name,categorie_compte,secteur_activite,telephone,telephone2,email,site_web")
- Contacts d'une société : query_table(table="contacts", filters={"client_id.eq":"<id_client>"}, select="nom,prenom,fonction,service,email,email2,telephone,telephone2,mobile")
- Chercher un contact par nom : query_table(table="contacts", filters={"nom.ilike":"%dupont%"}, select="nom,prenom,fonction,email,email2,telephone,telephone2,mobile,client_id")

- Devis d'un client : query_table(table="devis", filters={"client_id.eq":"<id_client>"}, select="ref,sujet,montant,statut,date,agence,probabilite", order="-date")
- Commandes d'un client : query_table(table="commandes", filters={"client_id.eq":"<id_client>"}, select="ref,nom,montant,statut,date,livraison,agence", order="-date")
- Factures d'un client : query_table(table="factures", filters={"client_id.eq":"<id_client>"}, select="ref,montant,reste_a_payer,statut,date,echeance,jours_retard,agence", order="-date")
- Planification commande : query_table(table="commandes", filters={"client_id.eq":"<id_client>","statut.eq":"en_cours"}, select="ref,nom,montant,statut,date,livraison,custom_data")
- Affaires d'un client : query_table(table="affaires", filters={"client_id.eq":"<id_client>"}, select="nom,code_projet,statut,date_debut,date_fin,montant,agence", order="-date_debut")
- Marchés d'un client : query_table(table="marches", filters={"client_id.eq":"<id_client>"}, select="ref,nom,statut,date_debut,date_fin,montant,nb_affaires,agence", order="-date_debut")
- Tâches d'un client : query_table(table="taches_commerciales", filters={"client_id.eq":"<id_client>"}, select="titre,description,priorite,statut,echeance,assigne_nom,createur_nom,affaire_nom", order="echeance")
- Tâches en cours assignées à quelqu'un : query_table(table="taches_commerciales", filters={"assigne_email.eq":"<email>","statut.in":"(a_faire,en_cours)"}, select="titre,priorite,statut,echeance,client_name", order="echeance")
- Opportunités d'un client : query_table(table="opportunites", filters={"client_id.eq":"<id_client>"}, select="nom,code,stage,statut,montant,probabilite,pipe,type_origine,responsable,contact_name,date_signature", order="-date_signature")
- Pipeline opportunités en cours : query_table(table="opportunites", filters={"statut.eq":"IN_PROGRESS"}, select="nom,client_name,stage,montant,probabilite,responsable,date_signature", order="-montant")

IMPORTANT pour les recherches société/contacts :
- Quand on te demande une société, cherche d'abord dans la table clients, puis récupère ses contacts avec client_id. Cherche aussi les devis, commandes et factures si pertinent.
- Affiche les résultats de manière structurée : fiche société (adresse, CA, catégorie, commercial) puis liste des contacts avec TOUTES leurs coordonnées.
- Pour chaque contact, affiche : Nom Prénom, Fonction, puis chaque email en lien <a href="mailto:..."> et chaque numéro de téléphone en clair (format 01 23 45 67 89).
- Quand on te demande la planification ou "où ça en est" pour un client, cherche ses commandes en cours (statut en_cours) avec custom_data pour les lignes et dates prévisionnelles, ses devis en attente, et ses factures impayées.
- Pour les dossiers/affaires/marchés, récupère les infos dans les tables affaires et marches.

HISTORIQUE / POINT COMPLET SUR UN CLIENT :
Quand on te demande un "historique", "point complet", "résumé", "où on en est" ou "situation" d'un client, tu DOIS faire un tour d'horizon exhaustif en enchaînant ces requêtes :
1. Fiche client : si le nom est incertain, d'abord search_clients(q="<nom approximatif>") pour identifier le bon client, puis query_table(table="clients", filters={"id.eq":"<id>"}) — infos générales, CA, catégorie, commercial, statut. IMPORTANT : noter le champ "siren" du client.
2. Établissements secondaires : SI le client a un SIREN, chercher les autres établissements : query_table(table="clients", filters={"siren.eq":"<siren>","id.neq":"<id>"}, select="id,name,city,code_postal,siret,est_siege,etat_insee,status,ca"). Cela donne la liste de TOUS les établissements du même groupe. Noter leurs id pour les étapes suivantes.
3. Devis en cours : pour CHAQUE établissement (client principal + secondaires trouvés en étape 2), chercher les devis : query_table(table="devis", filters={"client_id.eq":"<id>","statut.in":"(pending,sent)"}, select="ref,sujet,montant,statut,date,probabilite,agence", order="-date")
4. Commandes en cours : pour CHAQUE établissement, chercher : query_table(table="commandes", filters={"client_id.eq":"<id>","statut.eq":"en_cours"}, select="ref,nom,montant,statut,date,livraison,agence,surface_facturee,custom_data", order="-date") — commandes actives avec dates de livraison (DLR) et planification. Dans custom_data._lines : extraire estimatedDeliveryDate (date de livraison prévue), estimatedBillingDate (date de facturation prévue), projectedBillingDate (date de facturation projetée), startDate, endDate pour chaque ligne
5. Factures : pour CHAQUE établissement : query_table(table="factures", filters={"client_id.eq":"<id>"}, select="ref,montant,reste_a_payer,statut,date,echeance,jours_retard,agence", order="-date") — reste à facturer (montant commande - factures émises) et factures impayées (statut "attente" ou "retard" avec jours de retard et reste_a_payer)
6. Derniers comptes-rendus : query_table(table="reports", filters={"client_id.eq":"<id>"}, select="titre,date,type_cr,agence", order="-date", limit=5) — les 5 derniers CR pour contexte relationnel
7. Opportunités : pour CHAQUE établissement, query_table(table="opportunites", filters={"client_id.eq":"<id>"}, select="nom,code,stage,statut,montant,probabilite,pipe,responsable,contact_name,date_signature", order="-date_signature") — opportunités commerciales en cours/gagnées/perdues, avec stade, montant, probabilité et date de signature prévisionnelle
8. Tâches commerciales : pour CHAQUE établissement, query_table(table="taches_commerciales", filters={"client_id.eq":"<id>"}, select="titre,priorite,statut,echeance,assigne_nom,affaire_nom", order="echeance") — tâches à faire / en cours liées au client (qui doit faire quoi, pour quand)

PRÉSENTATION PAR ÉTABLISSEMENT :
Si le client a des établissements secondaires avec de l'activité (devis, commandes ou factures), tu DOIS séparer les informations par établissement :

🏢 <b>NOM ÉTABLISSEMENT PRINCIPAL</b> (Siège — SIRET xxx — Ville)
- 📝 Pipeline devis : ...
- 📦 Commandes en cours : ref, nom, montant, DLR, planification...
- 💰 Reste à facturer : ...
- ⚠️ Factures impayées : ...
- 🎯 Opportunités : nom, stade, montant, probabilité, signature prévue...
- ✅ Tâches : titre, statut, échéance, assigné à...

🏢 <b>NOM ÉTABLISSEMENT SECONDAIRE 1</b> (Secondaire — SIRET xxx — Ville)
- 📝 Pipeline devis : ...
- 📦 Commandes en cours : ...
- 💰 Reste à facturer : ...
- ⚠️ Factures impayées : ...

(... répéter pour chaque établissement ayant de l'activité)

📊 <b>TOTAL GROUPE (SIREN xxx)</b>
- Total devis en attente : X k€
- Total commandes en cours : X k€
- Total reste à facturer : X k€
- Total impayés : X k€

📞 Dernières interactions : résumé des derniers CR

S'il n'y a qu'un seul établissement (pas de SIREN ou pas d'autres établissements), présente directement sans séparation :
- 📋 Fiche : nom, ville, catégorie, commercial, statut
- 📝 Pipeline devis : nombre, montant total en attente
- 📦 Commandes en cours : pour chaque commande, afficher ref, nom, montant, date de livraison (DLR = champ "livraison"), et si custom_data disponible : dates prévisionnelles par ligne (livraison estimée, facturation estimée/projetée)
- 💰 Reste à facturer : montant total restant à facturer sur les commandes en cours
- ⚠️ Factures impayées : nombre, montant total, jours de retard
- 🎯 Opportunités : pour chaque opportunité en cours/récente : nom, stade, montant, probabilité, date de signature prévisionnelle, responsable, contact
- ✅ Tâches commerciales : tâches à faire / en cours (titre, priorité, échéance, assigné à) ; signale les tâches en retard (échéance dépassée et statut non terminé)
- 📞 Dernières interactions : résumé des derniers CR

Réponds en français, concis, avec des chiffres exacts issus des outils. Format monnaie : k€ ou M€ pour les grands nombres.
Tutoie l'utilisateur et personnalise tes réponses en fonction de son profil.

Date actuelle : ${new Date().toISOString().slice(0,10)}
${userProfile ? `\nUtilisateur connecté : ${userProfile.prenom || ''} ${userProfile.nom || ''} (${userProfile.email || ''})${userProfile.poste ? ' — Poste : ' + userProfile.poste : ''}${userProfile.etablissement ? ' — Agence : ' + userProfile.etablissement : ''}` : ''}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { question, history, userProfile, stream, glossary } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Missing question' });

  const systemPrompt = buildSystemPrompt(userProfile, glossary);

  // ─── MODE SSE STREAMING ───
  if (stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    const sse = (data) => { try { res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch(e) {} };

    try {
      const messages = Array.isArray(history) ? history.slice(-10) : [];
      messages.push({ role: 'user', content: question });

      let iterations = 0;
      const MAX_ITER = 6;
      while (iterations < MAX_ITER) {
        iterations++;
        sse({ type: 'status', text: iterations === 1 ? 'Réflexion...' : 'Analyse approfondie...' });

        const data = await callClaude(ANTHROPIC_KEY, {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: systemPrompt,
          tools: TOOLS,
          messages
        });

        if (data.stop_reason === 'tool_use') {
          const toolUses = data.content.filter(c => c.type === 'tool_use');
          messages.push({ role: 'assistant', content: data.content });
          // Envoyer le statut des outils en cours
          const labels = toolUses.map(t => toolLabel(t)).join(', ');
          sse({ type: 'status', text: labels + '...' });
          const toolResults = [];
          for (const tu of toolUses) {
            const result = await executeTool(tu.name, tu.input);
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
        sse({ type: 'done', result });
        res.end();
        return;
      }
      sse({ type: 'done', result: "Trop d'itérations — reformule ta question." });
      res.end();
    } catch (e) {
      console.error('AI chat stream error:', e);
      sse({ type: 'error', text: e.message });
      res.end();
    }
    return;
  }

  // ─── MODE CLASSIQUE (non-streaming) ───
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

      if (data.stop_reason === 'tool_use') {
        const toolUses = data.content.filter(c => c.type === 'tool_use');
        messages.push({ role: 'assistant', content: data.content });
        const toolResults = [];
        for (const tu of toolUses) {
          const result = await executeTool(tu.name, tu.input);
          const str = JSON.stringify(result);
          const truncated = str.length > 8000 ? str.substring(0, 8000) + '... [tronqué]' : str;
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: truncated });
        }
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

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
