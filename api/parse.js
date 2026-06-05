export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { file, filename } = req.body;
  if (!file || !filename) {
    return res.status(400).json({ error: 'Missing file (base64) or filename' });
  }

  const ext = filename.toLowerCase().split('.').pop();
  const buffer = Buffer.from(file, 'base64');

  try {
    let text = '';
    let metadata = { type: ext, filename };

    switch (ext) {
      case 'msg': {
        const msgModule = await import('@kenjiuno/msgreader');
        const MsgReader = msgModule.default?.default || msgModule.default;
        const reader = new MsgReader(buffer);
        const fileData = reader.getFileData();
        metadata.subject = fileData.subject || '';
        metadata.from = fileData.senderName || fileData.senderEmail || '';
        metadata.date = fileData.messageDeliveryTime || fileData.clientSubmitTime || '';
        const body = fileData.body || '';
        text = `De : ${metadata.from}\nObjet : ${metadata.subject}\nDate : ${metadata.date}\n\n${body}`;
        break;
      }

      default:
        return res.status(400).json({ error: `Format .${ext} non supporté côté serveur. Seul .msg est traité ici.` });
    }

    const MAX_CHARS = 15000;
    if (text.length > MAX_CHARS) {
      text = text.substring(0, MAX_CHARS) + '\n\n[… document tronqué à ' + MAX_CHARS + ' caractères]';
    }

    return res.status(200).json({ text: text.trim(), metadata });
  } catch (err) {
    console.error(`Parse error for ${filename}:`, err);
    return res.status(500).json({ error: `Erreur d'extraction pour ${filename}: ${err.message}` });
  }
}
