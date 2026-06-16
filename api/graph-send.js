// Envoi d'email via Microsoft Graph, depuis la boîte de la personne connectée.
//
// Le navigateur transmet le refresh_token Microsoft (capté au login OAuth Supabase,
// scope offline_access). Cet endpoint l'échange contre un jeton d'accès frais
// (grant_type=refresh_token) puis appelle POST /me/sendMail.
//
// Variables d'environnement requises (Vercel) — MÊME app registration que Supabase :
//   AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID (Directory/tenant ID)
//
// L'app Entra doit avoir la permission déléguée Microsoft Graph "Mail.Send"
// avec consentement administrateur accordé.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { refresh_token, access_token, to, subject, html, text, cc, attachments } = req.body || {};

  if (!to || !to.length) return res.status(400).json({ error: 'Destinataire(s) manquant(s)' });
  if (!subject) return res.status(400).json({ error: 'Objet manquant' });

  let token = access_token || null;
  let newRefresh = null;

  // Rafraîchir le jeton si on dispose d'un refresh_token (plus fiable qu'un access_token
  // potentiellement expiré).
  if (refresh_token) {
    const CLIENT_ID = process.env.AZURE_CLIENT_ID;
    const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
    const TENANT = process.env.AZURE_TENANT_ID || 'common';
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.status(500).json({ error: 'AZURE_CLIENT_ID / AZURE_CLIENT_SECRET non configurés' });
    }
    try {
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token,
        scope: 'openid offline_access https://graph.microsoft.com/Mail.Send'
      });
      const tr = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      const tj = await tr.json().catch(() => ({}));
      if (tr.ok && tj.access_token) {
        token = tj.access_token;
        newRefresh = tj.refresh_token || null;
      } else if (!token) {
        return res.status(401).json({ error: 'refresh_failed', details: tj.error_description || JSON.stringify(tj) });
      }
    } catch (e) {
      if (!token) return res.status(401).json({ error: 'refresh_error', details: e.message });
    }
  }

  if (!token) return res.status(401).json({ error: 'Aucun jeton Microsoft disponible' });

  // Construire le message Graph
  const toRecipients = (Array.isArray(to) ? to : [to]).map(a => ({ emailAddress: { address: a } }));
  const ccRecipients = (cc ? (Array.isArray(cc) ? cc : [cc]) : []).map(a => ({ emailAddress: { address: a } }));
  const graphAttachments = (Array.isArray(attachments) ? attachments : [])
    .filter(a => a && a.name && a.contentBytes)
    .map(a => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.name,
      contentType: a.contentType || 'application/octet-stream',
      contentBytes: a.contentBytes
    }));

  const message = {
    message: {
      subject,
      body: { contentType: html ? 'HTML' : 'Text', content: html || text || '' },
      toRecipients,
      ccRecipients,
      ...(graphAttachments.length ? { attachments: graphAttachments } : {})
    },
    saveToSentItems: true
  };

  try {
    const gr = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    if (!gr.ok) {
      const t = await gr.text();
      console.error('Graph sendMail error:', gr.status, t);
      return res.status(gr.status === 401 ? 401 : 502).json({ error: 'graph_send_failed', details: t });
    }
    // 202 Accepted, corps vide
    return res.status(200).json({ success: true, refresh_token: newRefresh });
  } catch (e) {
    console.error('Graph send error:', e.message, e.stack);
    return res.status(500).json({ error: e.message });
  }
}
