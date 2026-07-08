// Rappel automatique par email des sollicitations arrivées à la date « À faire avant » et non clôturées.
// Déclenché par un cron Vercel (voir vercel.json). Envoie un email à l'assigné via Microsoft Graph
// (flux app-only client_credentials, permission d'APPLICATION Mail.Send) et marque la sollicitation comme rappelée.
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

const STATUT_LBL = { a_solliciter: 'À solliciter', sollicite: 'Sollicité', interesse: 'Intéressé' };
function fmtDate(e) { if (!e) return ''; const d = new Date(e); if (isNaN(d.getTime())) return e; const p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(); }

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'] || '';
    if (auth !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });
  }
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ error: 'AZURE_CLIENT_ID / AZURE_CLIENT_SECRET non configurés' });

  try {
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const cutoff = endOfToday.toISOString();

    // Sollicitations à rappeler : non clôturées (pas converti / sans_suite), avec date « À faire avant » ≤ aujourd'hui,
    // pas encore rappelées, avec un assigné disposant d'un email.
    const q = 'sollicitations?select=id,client_name,opportunite_nom,statut,date_relance,assigne_nom,assigne_email,commentaire'
      + '&statut=in.(a_solliciter,sollicite,interesse)'
      + '&date_relance=not.is.null'
      + '&date_relance=lte.' + encodeURIComponent(cutoff)
      + '&or=(rappel_envoye.is.null,rappel_envoye.is.false)'
      + '&assigne_email=not.is.null'
      + '&limit=200';
    const list = await sbReq(q);
    if (!Array.isArray(list) || !list.length) return res.status(200).json({ ok: true, rappeles: 0, message: 'Aucune sollicitation à rappeler' });

    const token = await appToken();
    let sent = 0; const errors = [];
    for (const s of list) {
      const enRetard = new Date(s.date_relance).getTime() < now.getTime();
      const ctx = [
        s.client_name ? '<b>Compte :</b> ' + String(s.client_name).replace(/</g, '&lt;') : '',
        s.opportunite_nom ? '<b>Opportunité :</b> ' + String(s.opportunite_nom).replace(/</g, '&lt;') : '',
        '<b>Statut :</b> ' + (STATUT_LBL[s.statut] || s.statut),
        '<b>À faire avant :</b> ' + fmtDate(s.date_relance) + (enRetard ? ' (dépassé)' : " (aujourd'hui)"),
        s.commentaire ? '<b>Note :</b> ' + String(s.commentaire).replace(/</g, '&lt;').replace(/\n/g, '<br>') : '',
      ].filter(Boolean).join('<br>');
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
        <p>Bonjour ${s.assigne_nom ? String(s.assigne_nom).split(' ')[0] : ''},</p>
        <p>Rappel : la sollicitation suivante ${enRetard ? '<b style="color:#c0392b">a dépassé sa date</b>' : "arrive à échéance aujourd'hui"} :</p>
        <p style="font-size:15px"><b>${String(s.client_name || '').replace(/</g, '&lt;')}</b></p>
        <p>${ctx}</p>
        <p style="color:#666;font-size:12px">— Rappel automatique du CRM</p></div>`;
      try {
        const r = await fetch('https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(s.assigne_email) + '/sendMail', {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { subject: '🤝 Rappel sollicitation : ' + (s.client_name || ''), body: { contentType: 'HTML', content: html }, toRecipients: [{ emailAddress: { address: s.assigne_email } }] }, saveToSentItems: false })
        });
        if (!r.ok) { errors.push('mail ' + s.id + ': ' + (await r.text()).slice(0, 120)); continue; }
        await sbReq('sollicitations?id=eq.' + s.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ rappel_envoye: true, rappel_date: new Date().toISOString() }) });
        sent++;
      } catch (e) { errors.push('sollicitation ' + s.id + ': ' + e.message); }
    }
    return res.status(200).json({ ok: true, candidats: list.length, rappeles: sent, erreurs: errors });
  } catch (e) {
    console.error('sollicitations-rappels error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
