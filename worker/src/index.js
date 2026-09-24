const ORIGIN = 'https://azrism-code.github.io';
const SYMBOL = /^[A-Z][A-Z0-9-]{0,14}$/;
const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'X-Tiingo-Token',
  'Vary': 'Origin',
};

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export default {
  async fetch(request) {
    if (request.headers.get('Origin') !== ORIGIN) return reply({ error: 'Origin not allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405);
    const token = request.headers.get('X-Tiingo-Token') || '';
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return reply({ error: 'Missing token' }, 401);
    const url = new URL(request.url);
    let upstream;
    if (url.pathname === '/quotes') {
      const symbols = url.searchParams.get('symbols')?.split(',') || [];
      if (!symbols.length || symbols.length > 100 || symbols.some(s => !SYMBOL.test(s))) return reply({ error: 'Invalid symbols' }, 400);
      upstream = new URL('https://api.tiingo.com/tiingo/equity/intraday');
      upstream.searchParams.set('tickers', [...new Set(symbols)].join(','));
    } else if (url.pathname === '/history') {
      const symbol = url.searchParams.get('symbol') || '';
      const start = url.searchParams.get('startDate') || '';
      if (!SYMBOL.test(symbol) || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return reply({ error: 'Invalid history request' }, 400);
      upstream = new URL(`https://api.tiingo.com/tiingo/daily/${symbol}/prices`);
      upstream.searchParams.set('startDate', start);
    } else return reply({ error: 'Not found' }, 404);
    try {
      const response = await fetch(upstream, { headers: { Authorization: `Token ${token}`, Accept: 'application/json' } });
      if (!response.ok) return reply({ error: 'Tiingo request failed' }, response.status);
      return new Response(response.body, { status: 200, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    } catch { return reply({ error: 'Tiingo unavailable' }, 502); }
  },
};
