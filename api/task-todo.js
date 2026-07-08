// Pousse une tâche commerciale vers Microsoft To Do (boîte de l'assigné) + email de notification.
// Utilise le flux "client credentials" (app-only) de l'app Entra.
//
// Permissions d'APPLICATION requises (Azure → API permissions, avec consentement admin) :
//   - Tasks.ReadWrite.All  (créer/maj des tâches To Do dans la boîte de l'assigné)
//   - Mail.Send            (email de notification envoyé "as" le créateur)
//
// Variables d'environnement (Vercel) : AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID

const TENANT = process.env.AZURE_TENANT_ID || 'common';
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

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
async function graph(token, method, path, body) {
  const r = await fetch('https://graph.microsoft.com/v1.0' + path, {
    method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const txt = await r.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) {}
  if (!r.ok) throw new Error('graph ' + method + ' ' + path + ' → ' + r.status + ': ' + txt.slice(0, 300));
  return data;
}
async function defaultListId(token, email) {
  const lists = await graph(token, 'GET', `/users/${encodeURIComponent(email)}/todo/lists`);
  const arr = (lists && lists.value) || [];
  const def = arr.find(l => l.wellknownListName === 'defaultList') || arr[0];
  if (!def) throw new Error('Aucune liste To Do trouvée pour ' + email);
  return def.id;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ error: 'AZURE_CLIENT_ID / AZURE_CLIENT_SECRET non configurés' });

  const { action = 'create', assigneeEmail, assignerEmail, assignerName, title, body, dueDateTime, todoTaskId, emailHtml, importance, subject } = req.body || {};
  if (!assigneeEmail) return res.status(400).json({ error: 'assigneeEmail manquant' });

  try {
    const token = await appToken();

    if (action === 'complete' || action === 'delete') {
      if (!todoTaskId) return res.status(400).json({ error: 'todoTaskId manquant' });
      const listId = await defaultListId(token, assigneeEmail);
      if (action === 'complete') await graph(token, 'PATCH', `/users/${encodeURIComponent(assigneeEmail)}/todo/lists/${listId}/tasks/${todoTaskId}`, { status: 'completed' });
      else await graph(token, 'DELETE', `/users/${encodeURIComponent(assigneeEmail)}/todo/lists/${listId}/tasks/${todoTaskId}`);
      return res.status(200).json({ ok: true });
    }

    // action create
    if (!title) return res.status(400).json({ error: 'title manquant' });
    const listId = await defaultListId(token, assigneeEmail);
    const taskBody = {
      title,
      body: { contentType: 'text', content: body || '' }
    };
    if (importance && ['low', 'normal', 'high'].includes(importance)) taskBody.importance = importance;
    if (dueDateTime) {
      taskBody.dueDateTime = { dateTime: dueDateTime, timeZone: 'Europe/Paris' };
      taskBody.isReminderOn = true;
      taskBody.reminderDateTime = { dateTime: dueDateTime, timeZone: 'Europe/Paris' };
    }
    const created = await graph(token, 'POST', `/users/${encodeURIComponent(assigneeEmail)}/todo/lists/${listId}/tasks`, taskBody);

    // Email de notification (non bloquant) envoyé depuis la boîte du créateur si possible, sinon l'assigné
    let emailSent = false;
    const sender = assignerEmail || assigneeEmail;
    try {
      await graph(token, 'POST', `/users/${encodeURIComponent(sender)}/sendMail`, {
        message: {
          subject: subject || ('Nouvelle tâche commerciale : ' + title),
          body: { contentType: 'HTML', content: emailHtml || ('<p>Une tâche vous a été assignée' + (assignerName ? ' par ' + assignerName : '') + ' :</p><p><b>' + title + '</b></p>' + (body ? '<p>' + String(body).replace(/\n/g, '<br>') + '</p>' : '') + (dueDateTime ? '<p>Échéance : ' + dueDateTime.replace('T', ' ') + '</p>' : '')) },
          toRecipients: [{ emailAddress: { address: assigneeEmail } }]
        },
        saveToSentItems: true
      });
      emailSent = true;
    } catch (e) { console.warn('task email failed:', e.message); }

    return res.status(200).json({ ok: true, todoTaskId: created && created.id, emailSent });
  } catch (e) {
    console.error('task-todo error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
