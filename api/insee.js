export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const INSEE_KEY = process.env.INSEE_API_KEY;
  if (!INSEE_KEY) {
    return res.status(500).json({ error: 'INSEE_API_KEY non configurée sur le serveur' });
  }

  // Path: /api/insee?path=/siret&q=siren:337587422...
  const apiPath = req.query.path;
  if (!apiPath) {
    return res.status(400).json({ error: 'Missing ?path= parameter' });
  }

  // Build query string from remaining params (exclude 'path')
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'path') params.append(key, value);
  }
  const qs = params.toString();
  const url = 'https://api.insee.fr/api-sirene/3.11' + apiPath + (qs ? '?' + qs : '');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-INSEE-Api-Key-Integration': INSEE_KEY,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const contentType = response.headers.get('content-type') || '';
    const data = await response.text();

    res.status(response.status);
    res.setHeader('Content-Type', contentType);
    res.send(data);
  } catch (err) {
    console.error('[INSEE Proxy]', err);
    res.status(502).json({ error: 'Proxy error', message: err.message });
  }
}
