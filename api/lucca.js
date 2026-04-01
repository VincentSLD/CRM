export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const LUCCA_URL = process.env.LUCCA_BASE_URL;
  const LUCCA_KEY = process.env.LUCCA_API_KEY;

  if (!LUCCA_URL || !LUCCA_KEY) {
    return res.status(500).json({ error: 'LUCCA_BASE_URL or LUCCA_API_KEY not configured' });
  }

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
  const url = LUCCA_URL + apiPath + (qs ? '?' + qs : '');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `lucca application=${LUCCA_KEY}`,
        'Accept': 'application/json',
      },
    });

    const contentType = response.headers.get('content-type') || '';
    const data = await response.text();

    res.status(response.status);
    res.setHeader('Content-Type', contentType);
    res.send(data);
  } catch (err) {
    console.error('[Lucca Proxy]', err);
    res.status(502).json({ error: 'Proxy error', message: err.message });
  }
}
