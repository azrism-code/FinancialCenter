// Each user keeps their Tiingo token on their own device.
(() => {
  let uid = '', busy = false, refreshed = 0;
  const loadingHistory = new Set();
  const storage = name => `financial-center-tiingo-${name}-${uid}`;
  const token = () => localStorage.getItem(storage('token'));
  const relay = () => localStorage.getItem(storage('relay'));
  const eligible = x => /^[A-Z][A-Z0-9-]{0,14}$/.test(x.symbol);
  const status = message => { quoteStatus = message; render(); };
  async function query(route, parameters) {
    if (!token() || !relay()) throw Error('יש להגדיר טוקן Tiingo וכתובת מתווך');
    const url = new URL(route, relay());
    Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, { headers: { 'X-Tiingo-Token': token() }, cache: 'no-store' });
    if (!response.ok) throw Error(response.status === 429 ? 'מכסת Tiingo הושגה' : `שגיאת שערים ${response.status}`);
    return response.json();
  }
  async function refresh(force = false) {
    if (!remoteReady || !uid || busy || !token() || !relay() || (!force && Date.now() - refreshed < 300000)) return;
    const items = state.items.filter(eligible);
    if (!items.length) return;
    busy = true; const activeUid = uid;
    status(`מעדכן ${items.length} שערים...`);
    try {
      const quotes = await query('quotes', { symbols: items.map(x => x.symbol).join(',') });
      if (!remoteReady || uid !== activeUid) return;
      const bySymbol = new Map(items.map(x => [x.symbol, x]));
      let updated = 0;
      for (const q of quotes) {
        const item = bySymbol.get(q.ticker);
        if (!item || !Number.isFinite(q.tngoLast) || q.tngoLast <= 0) continue;
        item.price = q.tngoLast;
        item.quoteTime = Date.parse(q.timestamp) || Date.now();
        item.quoteSource = 'Tiingo';
        updated++;
      }
      refreshed = Date.now();
      if (updated) save();
      status(`${updated}/${items.length} שערים עודכנו · ${new Date().toLocaleTimeString('he-IL')}`);
    } catch (error) { status(error.message); }
    finally { busy = false; }
  }
  async function history(symbol) {
    const item = state.items.find(x => x.symbol === symbol);
    if (!item || !eligible(item) || !token() || !relay()) return;
    if (loadingHistory.has(symbol) || (item.historySource === 'Tiingo' && Date.now() - item.historyFetched < 86400000)) return;
    loadingHistory.add(symbol);
    const activeUid = uid;
    status(`טוען גרף ${symbol}...`);
    try {
      const from = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
      const points = await query('history', { symbol, startDate: from });
      if (!remoteReady || uid !== activeUid || !state.items.includes(item)) return;
      const valid = points.filter(p => Number.isFinite(p.close) && p.close > 0 && p.date);
      if (valid.length < 2) throw Error('אין מספיק נתונים לגרף');
      item.history = valid.map(p => p.close);
      item.historyDates = valid.map(p => p.date);
      item.historySource = 'Tiingo';
      item.historyFetched = Date.now();
      save(); status(`גרף ${symbol} עודכן`);
    } catch (error) { status(error.message); }
    finally { loadingHistory.delete(symbol); }
  }
  window.marketQuotes = {
    onPortfolioLoaded(newUid) { uid = newUid; refreshed = 0; refresh(); },
    onSignOut() { uid = ''; busy = false; refreshed = 0; quoteStatus = ''; },
    onResearch(symbol) { history(symbol); },
    openSettings() {
      if (!uid) return;
      const configured = !!token();
      document.getElementById('modal').innerHTML = `<div class="dialog"><div role="dialog" aria-modal="true" aria-label="הגדרת שערים"><h2>שערים וגרפים · Tiingo</h2><p class="note">שערים בבקשה אחת; גרף היסטורי נטען בעת פתיחת מניה. יש להגדיר מתווך כדי שהדפדפן יוכל לקרוא מ־Tiingo.</p><form id="quotekeyform"><label>כתובת המתווך</label><input id="relay" type="url" required placeholder="https://example.workers.dev/" value="${esc(relay() || '')}"><label>טוקן Tiingo</label><input id="quotekey" type="password" autocomplete="off" placeholder="${configured ? 'טוקן שמור · הזן חדש להחלפה' : 'הדבק טוקן'}"><p class="note">הטוקן נשמר במכשיר הזה, ונשלח למתווך ול־Tiingo. הוא אינו נשמר ב־Firebase. <a href="https://api.tiingo.com/account/api/token" target="_blank" rel="noopener noreferrer">עמוד הטוקן</a></p><div class="actions"><button type="button" class="btn" id="closequotes">סגור</button>${configured ? '<button type="button" class="btn" id="clearquotes">מחק הגדרות</button>' : ''}<button class="btn primary">שמור ורענן</button></div></form></div>`;
      document.getElementById('closequotes').onclick = close;
      document.getElementById('clearquotes')?.addEventListener('click', () => { localStorage.removeItem(storage('token')); localStorage.removeItem(storage('relay')); close(); status('הגדרות Tiingo נמחקו'); });
      document.getElementById('quotekeyform').onsubmit = event => {
        event.preventDefault();
        const address = new URL(document.getElementById('relay').value);
        const key = document.getElementById('quotekey').value.trim();
        if (address.protocol !== 'https:') { alert('יש להזין כתובת HTTPS'); return; }
        if (key && !/^[A-Za-z0-9_-]{20,100}$/.test(key)) { alert('טוקן לא תקין'); return; }
        if (key) localStorage.setItem(storage('token'), key);
        if (!token()) { alert('יש להזין טוקן'); return; }
        localStorage.setItem(storage('relay'), address.origin + '/');
        close(); refreshed = 0; refresh(true);
      };
    }
  };
})();
