export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const AKUITEO_ROOT = process.env.AKUITEO_URL || 'https://novamingenierie-test.myakuiteo.com/akuiteo/rest';
  const AKUITEO_USER = process.env.AKUITEO_USER || 'API1';
  const AKUITEO_PASS = process.env.AKUITEO_PASS || 'API1';

  // Path: /api/akuiteo?path=/crm/customers/search
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
  const url = AKUITEO_ROOT + apiPath + (qs ? '?' + qs : '');

  const auth = Buffer.from(`${AKUITEO_USER}:${AKUITEO_PASS}`).toString('base64');

  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': req.headers.accept || 'application/json',
  };

  let body = undefined;
  if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
    headers['Content-Type'] = req.headers['content-type'] || 'application/json';
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    const response = await fetch(url, {
      method: req.method,
      headers,
      body,
    });

    const contentType = response.headers.get('content-type') || '';
    const data = await response.text();

    res.status(response.status);
    res.setHeader('Content-Type', contentType);
    res.send(data);
  } catch (err) {
    console.error('[Akuiteo Proxy]', err);
    res.status(502).json({ error: 'Proxy error', message: err.message });
  }
}
