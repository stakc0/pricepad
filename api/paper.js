export default async function handler(req, res) {
  const upstream = new URL('https://www.pricepad.fun/api/paper');
  for (const [key, value] of Object.entries(req.query || {})) {
    if (Array.isArray(value)) value.forEach((item) => upstream.searchParams.append(key, item));
    else if (value != null) upstream.searchParams.set(key, value);
  }
  try {
    const response = await fetch(upstream, {
      method: req.method || 'GET',
      headers: { accept: 'application/json' },
    });
    const body = await response.text();
    res.status(response.status);
    res.setHeader('content-type', response.headers.get('content-type') || 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.send(body);
  } catch (error) {
    res.status(502).json({ error: 'Upstream Pricepad API unavailable' });
  }
}
