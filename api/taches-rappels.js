// Rappel automatique par email des tâches commerciales arrivées à échéance et non terminées.
// Déclenché par un cron Vercel (voir vercel.json). Envoie un email à l'assigné via Microsoft Graph
// (flux app-only client_credentials, permission d'APPLICATION Mail.Send) et marque la tâche comme rappelée.
//
// Variables d'environnement : AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_ANON_KEY), CRON_SECRET (optionnel).

const TENANT = process.env.AZURE_TENANT_ID || 'common';
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdWNjbml5b2Z6dndnb294amFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDQyNjgsImV4cCI6MjA4ODQ4MDI2OH0.dPerW1BApAxe26xzv9i7oWIubgGuzO5RibMvs-MFm88';

async function appToken() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default'
  });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString()
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('token: ' + (j.error_description || JSON.stringify(j)));
  return j.access_token;
}

async function sbReq(path, options = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const txt = await r.text();
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + txt.slice(0, 200));
  return txt ? JSON.parse(txt) : null;
}

const PRIO = { basse: 'Basse', normale: 'Normale', haute: 'Haute' };
function fmtDate(e) { if (!e) return ''; const d = new Date(e); if (isNaN(d.getTime())) return e; const p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(); }

export default async function handler(req, res) {
  // Sécurité : si CRON_SECRET est défini, exiger l'en-tête (Vercel Cron l'envoie automatiquement)
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'] || '';
    if (auth !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });
  }
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ error: 'AZURE_CLIENT_ID / AZURE_CLIENT_SECRET non configurés' });

  try {
    // Fin de la journée courante (UTC) — on rappelle les tâches dues aujourd'hui ou en retard
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const cutoff = endOfToday.toISOString();

    // Tâches à rappeler : non terminées/annulées, avec échéance ≤ aujourd'hui, pas encore rappelées, avec assigné
    const q = 'taches_commerciales?select=id,titre,description,priorite,statut,echeance,client_name,affaire_nom,opportunite_nom,assigne_nom,assigne_email,createur_email'
      + '&statut=in.(a_faire,en_cours)'
      + '&echeance=not.is.null'
      + '&echeance=lte.' + encodeURIComponent(cutoff)
      + '&or=(rappel_envoye.is.null,rappel_envoye.is.false)'
      + '&assigne_email=not.is.null'
      + '&limit=200';
    const taches = await sbReq(q);
    if (!Array.isArray(taches) || !taches.length) return res.status(200).json({ ok: true, rappeles: 0, message: 'Aucune tâche à rappeler' });

    const token = await appToken();
    let sent = 0; const errors = [];
    for (const t of taches) {
      const enRetard = new Date(t.echeance).getTime() < now.getTime();
      const ctx = [
        t.client_name ? '<b>Client :</b> ' + t.client_name : '',
        t.opportunite_nom ? '<b>Opportunité :</b> ' + t.opportunite_nom : '',
        t.affaire_nom ? '<b>Affaire :</b> ' + t.affaire_nom : '',
        '<b>Priorité :</b> ' + (PRIO[t.priorite] || 'Normale'),
        '<b>Échéance :</b> ' + fmtDate(t.echeance) + (enRetard ? ' (en retard)' : " (aujourd'hui)"),
        t.description ? '<b>Détail :</b> ' + String(t.description).replace(/</g, '&lt;').replace(/\n/g, '<br>') : '',
      ].filter(Boolean).join('<br>');
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
        <p>Bonjour ${t.assigne_nom ? String(t.assigne_nom).split(' ')[0] : ''},</p>
        <p>Rappel : la tâche commerciale suivante ${enRetard ? '<b style="color:#c0392b">est en retard</b>' : "arrive à échéance aujourd'hui"} et n'est pas encore terminée :</p>
        <p style="font-size:15px"><b>${String(t.titre || '').replace(/</g, '&lt;')}</b></p>
        <p>${ctx}</p>
        <p style="color:#666;font-size:12px">— Rappel automatique du CRM</p></div>`;
      const recipients = [{ emailAddress: { address: t.assigne_email } }];
      try {
        const r = await fetch('https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(t.assigne_email) + '/sendMail', {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { subject: '⏰ Rappel tâche : ' + (t.titre || ''), body: { contentType: 'HTML', content: html }, toRecipients: recipients }, saveToSentItems: false })
        });
        if (!r.ok) { errors.push('mail ' + t.id + ': ' + (await r.text()).slice(0, 120)); continue; }
        await sbReq('taches_commerciales?id=eq.' + t.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ rappel_envoye: true, rappel_date: new Date().toISOString() }) });
        sent++;
      } catch (e) { errors.push('tâche ' + t.id + ': ' + e.message); }
    }
    return res.status(200).json({ ok: true, candidats: taches.length, rappeles: sent, erreurs: errors });
  } catch (e) {
    console.error('taches-rappels error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
