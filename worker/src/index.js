const ORIGIN = 'https://azrism-code.github.io';
const SYMBOL = /^[A-Z0-9^][A-Z0-9.^_-]{0,19}$/;
const US_SYMBOL = /^[A-Z][A-Z0-9-]{0,14}$/;
const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'X-Tiingo-Token', Vary: 'Origin' };
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const finite = x => typeof x === 'number' && Number.isFinite(x) ? x : null;
export function dayAt(seconds, zone = 'America/New_York') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(seconds * 1000));
}
function reply(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
class MarketError extends Error { constructor(code, status = 502) { super(code); this.code = code; this.status = status; } }
async function jsonFetch(url, token, cacheSeconds = 0) {
  const key = new Request(url);
  const cache = !token && typeof caches !== 'undefined' ? caches.default : null;
  if (cache && cacheSeconds) { const found = await cache.match(key); if (found) return found.json(); }
  let response;
  try { response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0', ...(token ? { Authorization: `Token ${token}` } : {}) }, signal: AbortSignal.timeout(15000) }); }
  catch { throw new MarketError('unavailable'); }
  if (!response.ok) {
    const body = await response.text();
    const code = response.status === 429 ? 'rate_limit' : /invalid token|auth token was not correct/i.test(body) ? 'invalid_token' : [401,403].includes(response.status) ? 'access_denied' : response.status === 404 ? 'unsupported_symbol' : 'upstream_error';
    throw new MarketError(code, response.status);
  }
  let data; try { data = await response.json(); } catch { throw new MarketError('invalid_response'); }
  if (cache && cacheSeconds) await cache.put(key, new Response(JSON.stringify(data), { headers: { 'Content-Type':'application/json', 'Cache-Control':`public, max-age=${cacheSeconds}` } }));
  return data;
}
async function yahooChart(symbol, kind = 'quote') {
  const params = kind === 'daily' ? 'range=2y&interval=1d' : kind === 'intraday' ? 'range=5d&interval=5m&includePrePost=true' : 'range=5d&interval=1d';
  const body = await jsonFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`, null, kind === 'daily' ? 900 : 60);
  const result = body?.chart?.result?.[0];
  if (!result?.meta || body.chart.error) throw new MarketError('unsupported_symbol', 404);
  return result;
}
async function lookup(url) {
  const symbol=(url.searchParams.get('symbol')||'').trim().toUpperCase();
  if(symbol) {
    if(!SYMBOL.test(symbol))throw new MarketError('invalid_symbols',400);
    const chart=await yahooChart(symbol);
    const meta=chart.meta;
    if(!positive(meta.regularMarketPrice)||meta.symbol?.toUpperCase()!==symbol)throw new MarketError('unsupported_symbol',404);
    return {symbol,name:meta.longName||meta.shortName||symbol,exchange:meta.fullExchangeName||meta.exchangeName||'',currency:meta.currency||null};
  }
  const q=(url.searchParams.get('q')||'').trim();
  if(q.length<2||q.length>60||/[\x00-\x1f]/.test(q))throw new MarketError('invalid_query',400);
  const params=new URLSearchParams({q,quotesCount:'10',newsCount:'0',listsCount:'0'});
  const data=await jsonFetch(`https://query1.finance.yahoo.com/v1/finance/search?${params}`,null,60);
  if(!Array.isArray(data.quotes))throw new MarketError('invalid_response');
  return {results:data.quotes.filter(x=>SYMBOL.test(x.symbol||'')&&['EQUITY','ETF','MUTUALFUND','INDEX'].includes(x.quoteType)).slice(0,8).map(x=>({symbol:x.symbol,name:x.longname||x.shortname||x.symbol,exchange:x.exchDisp||x.exchange||'',type:x.quoteType}))};
}
export function yahooBars(chart) {
  const q = chart.indicators?.quote?.[0] || {}, adj = chart.indicators?.adjclose?.[0]?.adjclose || [];
  return (chart.timestamp || []).map((time,i) => ({ time, date:dayAt(time,chart.meta.exchangeTimezoneName || 'America/New_York'), close:finite(q.close?.[i]), open:finite(q.open?.[i]), high:finite(q.high?.[i]), low:finite(q.low?.[i]), volume:finite(q.volume?.[i]), adjClose:finite(adj[i]) })).filter(p=>positive(p.close)).sort((a,b)=>a.time-b.time);
}
export function normalizeYahoo(symbol, chart, now = Date.now()) {
  const m=chart.meta, zone=m.exchangeTimezoneName || 'America/New_York';
  if (!positive(m.regularMarketPrice) || !positive(m.regularMarketTime)) throw new MarketError('missing_quote');
  const sessionDate=dayAt(m.regularMarketTime,zone), bars=yahooBars(chart), current=bars.find(p=>p.date===sessionDate), previousIndex=(chart.timestamp||[]).map((t,i)=>({date:dayAt(t,zone),i})).filter(p=>p.date<sessionDate).at(-1), previous=previousIndex ? {date:previousIndex.date,close:chart.indicators?.quote?.[0]?.close?.[previousIndex.i]} : null;
  const regular=m.currentTradingPeriod?.regular;
  const live=!!(regular && now/1000>=regular.start && now/1000<regular.end && sessionDate===dayAt(now/1000,zone));
  // Use the same session's daily close when closed; never use chartPreviousClose (range baseline).
  const price=!live && current ? current.close : m.regularMarketPrice;
  const prevClose=previous && positive(previous.close) && Date.parse(sessionDate)-Date.parse(previous.date)<=7*86400000 ? previous.close : null;
  return { symbol, source:'Yahoo', price, prevClose, changePercent:positive(prevClose)?(price/prevClose-1)*100:null, quoteTime:m.regularMarketTime*1000, sessionDate, quoteKind:live?'regular':'close', currency:m.currency || null, timezone:zone, name:m.longName || m.shortName || '', open:current?.open??finite(m.regularMarketOpen), high:current?.high??finite(m.regularMarketDayHigh), low:current?.low??finite(m.regularMarketDayLow), volume:current?.volume??finite(m.regularMarketVolume), fallback:false };
}
function tokenFrom(request) { const token=request.headers.get('X-Tiingo-Token') || ''; if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new MarketError('missing_token',401); return token; }
function usCloseTime(date) { const t=Date.parse(date+'T20:00:00Z'), h=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(t)); return t+(16-h)*3600000; }
async function tiingoDaily(symbol,token,days=380) {
  if (!US_SYMBOL.test(symbol)) throw new MarketError('unsupported_symbol',404);
  const start=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
  const data=await jsonFetch(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices?startDate=${start}`,token);
  if (!Array.isArray(data)) throw new MarketError('invalid_response');
  return data.filter(p=>positive(p.close)&&p.date).map(p=>({...p,date:p.date.slice(0,10),time:usCloseTime(p.date.slice(0,10))/1000})).sort((a,b)=>a.time-b.time);
}
async function tiingoQuotes(symbols,token) {
  const eligible=symbols.filter(s=>US_SYMBOL.test(s)), errors=symbols.filter(s=>!US_SYMBOL.test(s)).map(symbol=>({symbol,code:'unsupported_symbol'}));
  if (!eligible.length) return {quotes:[],errors};
  const data=await jsonFetch(`https://api.tiingo.com/tiingo/equity/intraday?tickers=${eligible.join(',')}`,token);
  if (!Array.isArray(data)) throw new MarketError('invalid_response');
  const today=dayAt(Date.now()/1000), hm=new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()), weekday=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short'}).format(new Date());
  const active=!['Sat','Sun'].includes(weekday)&&hm>='09:30'&&hm<'16:00';
  const quotes=[];
  // Outside the regular session use EOD closes; do not present extended-hours reference prices as regular closes.
  for (const symbol of eligible) {
    try {
      const raw=data.find(q=>String(q.ticker).toUpperCase()===symbol), stamp=Date.parse(raw?.timestamp);
      if (active && Number.isFinite(stamp) && dayAt(stamp/1000)===today && positive(raw.tngoLast)) {
        quotes.push({symbol,source:'Tiingo',price:raw.tngoLast,prevClose:positive(raw.prevClose)?raw.prevClose:null,quoteTime:stamp,sessionDate:today,quoteKind:'reference',currency:'USD',timezone:'America/New_York',open:finite(raw.open),high:finite(raw.high),low:finite(raw.low),volume:finite(raw.volume)});
      } else {
        const bars=await tiingoDaily(symbol,token,12), last=bars.at(-1), prior=bars.at(-2);
        if (!last) throw new MarketError('missing_quote');
        quotes.push({symbol,source:'Tiingo',price:last.close,prevClose:prior?.close??null,quoteTime:usCloseTime(last.date),sessionDate:last.date,quoteKind:'close',currency:'USD',timezone:'America/New_York',open:finite(last.open),high:finite(last.high),low:finite(last.low),volume:finite(last.volume)});
      }
    } catch(error) { errors.push({symbol,code:error.code || 'unavailable'}); if (['rate_limit','invalid_token'].includes(error.code)) { for(const next of eligible.slice(eligible.indexOf(symbol)+1)) errors.push({symbol:next,code:error.code}); break; } }
  }
  return {quotes,errors};
}
async function series(symbol,provider,kind,token) {
  if (provider==='tiingo') {
    if (kind==='intraday') {
      if (!US_SYMBOL.test(symbol)) throw new MarketError('unsupported_symbol',404);
      const start=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
      const data=await jsonFetch(`https://api.tiingo.com/tiingo/equity/intraday/${encodeURIComponent(symbol)}/prices?startDate=${start}&resampleFreq=5min&afterHours=false`,token);
      if(!Array.isArray(data))throw new MarketError('invalid_response');
      const all=data.filter(p=>positive(p.close)&&Number.isFinite(Date.parse(p.date))).map(p=>({...p,time:Date.parse(p.date)/1000,date:dayAt(Date.parse(p.date)/1000)})).sort((a,b)=>a.time-b.time);
      const sessionDate=all.at(-1)?.date;
      return {source:'Tiingo',kind,timezone:'America/New_York',currency:'USD',sessionDate,points:all.filter(p=>p.date===sessionDate)};
    }
    return {source:'Tiingo',kind,timezone:'America/New_York',currency:'USD',points:await tiingoDaily(symbol,token)};
  }
  const chart=await yahooChart(symbol,kind), all=yahooBars(chart), zone=chart.meta.exchangeTimezoneName || 'America/New_York';
  // Pick the session of the regular quote. Before the next opening, show the last completed session.
  const sessionDate=dayAt(chart.meta.regularMarketTime,zone);
  let points=all,extended=null;
  if(kind==='intraday') {
    const regular=chart.meta.currentTradingPeriod?.regular;
    const hm=t=>new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(t*1000));
    const start=regular?hm(regular.start):'09:30',end=regular?hm(regular.end):'16:00';
    const inside=p=>hm(p.time)>=start&&hm(p.time)<=end;
    points=all.filter(p=>p.date===sessionDate&&inside(p));
    const last=all.at(-1);
    if(last&&last.time>chart.meta.regularMarketTime&&!inside(last))extended={price:last.close,time:last.time*1000,source:'Yahoo',kind:hm(last.time)<start?'pre':'post'};
  }
  return {source:'Yahoo',kind,timezone:zone,currency:chart.meta.currency,sessionDate,points,extended};
}
async function legacy(url,request) {
  const token=tokenFrom(request); let upstream;
  if(url.pathname==='/quotes') {
    const symbols=(url.searchParams.get('symbols')||'').split(',');
    if(!symbols.length||symbols.length>100||symbols.some(s=>!US_SYMBOL.test(s)))throw new MarketError('invalid_symbols',400);
    upstream='https://api.tiingo.com/tiingo/equity/intraday?tickers='+symbols.join(',');
  } else {
    const symbol=url.searchParams.get('symbol')||'',start=url.searchParams.get('startDate')||'';
    if(!US_SYMBOL.test(symbol)||!/^\d{4}-\d{2}-\d{2}$/.test(start))throw new MarketError('invalid_symbols',400);
    upstream=`https://api.tiingo.com/tiingo/daily/${symbol}/prices?startDate=${start}`;
  }
  return reply(await jsonFetch(upstream,token));
}
export default { async fetch(request) {
  if(request.headers.get('Origin')!==ORIGIN)return reply({error:'origin_not_allowed'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='GET')return reply({error:'method_not_allowed'},405);
  const url=new URL(request.url);
  try {
    if(['/quotes','/history'].includes(url.pathname))return await legacy(url,request);
    if(url.pathname==='/health')return reply({version:'1.7.2',providers:['yahoo','tiingo']});
    if(url.pathname==='/lookup')return reply(await lookup(url));
    const provider=url.searchParams.get('provider')||'yahoo';
    if(!['yahoo','tiingo'].includes(provider))throw new MarketError('invalid_provider',400);
    const token=provider==='tiingo'?tokenFrom(request):null;
    if(url.pathname==='/market') {
      const symbols=[...new Set((url.searchParams.get('symbols')||'').split(','))];
      if(!symbols.length||symbols.length>8||symbols.some(s=>!SYMBOL.test(s)))throw new MarketError('invalid_symbols',400);
      if(provider==='tiingo')return reply(await tiingoQuotes(symbols,token));
      const settled=await Promise.allSettled(symbols.map(async symbol=>normalizeYahoo(symbol,await yahooChart(symbol))));
      return reply({quotes:settled.filter(r=>r.status==='fulfilled').map(r=>r.value),errors:settled.flatMap((r,i)=>r.status==='rejected'?[{symbol:symbols[i],code:r.reason.code||'unavailable'}]:[])});
    }
    if(url.pathname==='/series') {
      const symbol=url.searchParams.get('symbol')||'',kind=url.searchParams.get('kind')||'daily';
      if(!SYMBOL.test(symbol)||!['daily','intraday'].includes(kind))throw new MarketError('invalid_symbols',400);
      return reply(await series(symbol,provider,kind,token));
    }
    return reply({error:'not_found'},404);
  } catch(error) { return reply({error:error.code||'unavailable'},error.status||502); }
} };
