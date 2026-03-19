export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

  const { to, subject, html, text, from_name, from_email, reply_to, cc } = req.body || {};

  if (!to || !to.length) return res.status(400).json({ error: 'Missing recipients' });
  if (!subject) return res.status(400).json({ error: 'Missing subject' });

  // Domaine d'envoi vérifié dans Resend
  const SEND_DOMAIN = process.env.RESEND_DOMAIN || 'noreply@novam.fr';
  const fromAddress = `${from_name || 'CRM'} <${SEND_DOMAIN}>`;

  try {
    const payload = {
      from: fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || '',
      text: text || '',
    };

    // Reply-to = email de la personne connectée
    if (reply_to) payload.reply_to = reply_to;
    // Copie à l'émetteur
    if (cc) payload.cc = Array.isArray(cc) ? cc : [cc];

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Resend API error:', err);
      return res.status(502).json({ error: 'Erreur envoi email', details: err });
    }

    const data = await response.json();
    return res.status(200).json({ success: true, id: data.id });
  } catch (e) {
    console.error('Send email error:', e);
    return res.status(500).json({ error: e.message });
  }
}
