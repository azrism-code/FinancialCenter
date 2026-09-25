// Provider preference syncs with the account; private API tokens stay on this device.
(() => {
  let uid='', generation=0, running=null, refreshed=0;
  const pending=new Set(), failures=new Map(), controllers=new Set();
  const labels={auto:'אוטומטי',yahoo:'Yahoo',tiingo:'Tiingo'};
  const errors={missing_token:'חסר טוקן Tiingo במכשיר הזה',invalid_token:'טוקן Tiingo אינו תקף',rate_limit:'מכסת הבקשות הושגה; נסה מאוחר יותר',access_denied:'הספק דחה את החיבור',unsupported_symbol:'הסימול אינו נתמך בספק',intraday_unavailable:'גרף תוך יומי אינו זמין בספק זה',missing_quote:'לא התקבל שער',invalid_response:'התקבלה תשובה לא תקינה',unavailable:'אין חיבור לספק',upstream_error:'שגיאה אצל ספק הנתונים'};
  const storage=name=>`financial-center-tiingo-${name}-${uid}`;
  const token=()=>localStorage.getItem(storage('token')) || '';
  const relay=()=>localStorage.getItem(storage('relay')) || 'https://financial-center-quotes.azrism.workers.dev/';
  const preference=()=>['auto','yahoo','tiingo'].includes(book.marketProvider)?book.marketProvider:'auto';
  const message=code=>errors[code] || 'לא ניתן לעדכן נתונים';
  const status=text=>{quoteStatus=text;render();};
  const current=(g,portfolio)=>g===generation&&remoteReady&&state===portfolio;
  const validPrice=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
  async function query(route,parameters,provider) {
    if(provider==='tiingo'&&!token())throw Object.assign(Error(errors.missing_token),{code:'missing_token'});
    const url=new URL(route,relay());Object.entries({...parameters,provider}).forEach(([k,v])=>url.searchParams.set(k,v));
    const controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),45000);
    try {
      const response=await fetch(url,{headers:provider==='tiingo'?{'X-Tiingo-Token':token()}:{},cache:'no-store',signal:controller.signal});
      let body;try{body=await response.json();}catch{throw Object.assign(Error(errors.invalid_response),{code:'invalid_response'});}
      if(!response.ok)throw Object.assign(Error(message(body.error)),{code:body.error||'unavailable'});
      return body;
    } finally{clearTimeout(timer);controllers.delete(controller);}
  }
  async function market(symbols,chosen=preference()) {
    const first=chosen==='auto'?'yahoo':chosen;
    let data;try{data=await query('market',{symbols:symbols.join(',')},first);}catch(e){data={quotes:[],errors:symbols.map(symbol=>({symbol,code:e.code||'unavailable'}))};}
    if(chosen==='auto'&&token()&&data.errors?.length) {
      const failed=data.errors.map(e=>e.symbol);let backup;
      try{backup=await query('market',{symbols:failed.join(',')},'tiingo');}catch(e){backup={quotes:[],errors:failed.map(symbol=>({symbol,code:e.code||'unavailable'}))};}
      data.quotes.push(...backup.quotes.map(q=>({...q,fallback:true})));data.errors=backup.errors;
    }
    return data;
  }
  function applyQuote(item,q) {
    if(!validPrice(q.price)||!Number.isFinite(q.quoteTime)||q.quoteTime>Date.now()+300000||Date.now()-q.quoteTime>7*86400000)return false;
    // Allow a different provider's official close for the same session, even if its timestamp differs.
    if(item.quoteSessionDate&&q.sessionDate<item.quoteSessionDate)return false;
    if(item.quoteSource===q.source&&item.quoteKind===q.quoteKind&&q.quoteTime<Number(item.quoteTime))return false;
    item.price=q.price;item.quoteTime=q.quoteTime;item.quoteFetched=Date.now();item.quoteSource=q.source;item.quoteKind=q.quoteKind;item.quoteSessionDate=q.sessionDate;item.quoteFallback=!!q.fallback;item.quoteError='';
    item.currency=q.currency||null;item.exchangeTimezone=q.timezone||'America/New_York';
    if(q.name)item.name=q.name;
    item.prevClose=validPrice(q.prevClose)?q.prevClose:null;item.dayChange=validPrice(q.prevClose)?(q.price/q.prevClose-1)*100:null;
    for(const key of ['open','high','low','volume'])item['market'+key[0].toUpperCase()+key.slice(1)]=Number.isFinite(q[key])?q[key]:null;
    return true;
  }
  async function refresh(force=false) {
    if(!remoteReady||!uid||running===generation||(!force&&Date.now()-refreshed<300000))return;
    const g=generation,portfolio=state,items=[...portfolio.items],selectedProvider=preference();running=g;
    let updated=0,fallback=0;const failed=[];
    status(`מעדכן שערים · ${labels[selectedProvider]}…`);
    try {
      for(let i=0;i<items.length;i+=8) {
        if(!current(g,portfolio))return;
        const batch=items.slice(i,i+8),result=await market(batch.map(x=>x.symbol),selectedProvider);
        if(!current(g,portfolio))return;
        const bySymbol=new Map(result.quotes.map(q=>[q.symbol,q]));
        for(const item of batch){if(!portfolio.items.includes(item))continue;const q=bySymbol.get(item.symbol);if(q&&applyQuote(item,q)){updated++;if(q.fallback)fallback++;}else{const code=result.errors.find(e=>e.symbol===item.symbol)?.code||'missing_quote';item.quoteError=message(code);failed.push({symbol:item.symbol,code});}}
        render();
        // Stop repeated requests when an explicit provider rejects every request for authentication or quota.
        if(!result.quotes.length&&result.errors.some(e=>['invalid_token','missing_token','rate_limit','access_denied'].includes(e.code))) {
          const code=result.errors[0].code;for(const item of items.slice(i+8)){item.quoteError=message(code);failed.push({symbol:item.symbol,code});}break;
        }
      }
      refreshed=Date.now();if(updated)save();
      status(`${updated}/${items.length} שערים עודכנו${fallback?` · ${fallback} מספק הגיבוי`:''}${failed.length?` · ${failed.length} נשארו שמורים: ${message(failed[0].code)}`:''}${items.length?'':' · הוסף מניות לתיק'}`);
      if(updated)primeHistory();
    } catch(e){if(current(g,portfolio))status(e.message||errors.unavailable);}
    finally{if(running===g)running=null;}
  }
  let activeSeries=0;const queue=[];
  async function limited(work) {if(activeSeries>=3)await new Promise(resolve=>queue.push(resolve));activeSeries++;try{return await work();}finally{activeSeries--;queue.shift()?.();}}
  async function history(symbol,kind='daily',quiet=true) {
    const item=state.items.find(x=>x.symbol===symbol);if(!item||!remoteReady||!uid)return;
    const g=generation,portfolio=state,pref=preference(),source=pref==='auto'?(item.quoteSource==='Tiingo'&&item.quoteFallback?'tiingo':'yahoo'):pref;
    const key=[g,symbol,kind,source].join(':'),field=kind==='daily'?'history':'intraday';
    if(pending.has(key)||Date.now()-(failures.get(key)||0)<300000)return;
    const sameProvider=pref==='auto'||item[field+'Source']===labels[pref];
    const ttl=kind==='daily'&&item.quoteKind==='close'?6*3600000:300000;
    if(sameProvider&&item[field+'Fetched']&&Date.now()-item[field+'Fetched']<ttl&&(kind==='daily'?item.historyRequestedSessionDate:item.intradaySessionDate)===item.quoteSessionDate&&(kind!=='daily'||item.historyQuoteKind===item.quoteKind))return;
    pending.add(key);
    try {
      const result=await limited(async()=>{if(!current(g,portfolio))return null;return query('series',{symbol,kind},source);});
      if(!result||!current(g,portfolio)||!portfolio.items.includes(item))return;
      const points=(result.points||[]).filter(p=>validPrice(p.close));if(points.length<2)throw Error('אין מספיק נקודות לגרף');
      if(kind==='daily') {
        item.history=points.map(p=>p.close);item.historyDates=points.map(p=>p.date);item.historyHigh=points.map(p=>p.high);item.historyLow=points.map(p=>p.low);item.historyVolume=points.map(p=>p.volume);item.historySessionDate=points.at(-1).date;item.historyQuoteKind=item.quoteKind;item.historyRequestedSessionDate=item.quoteSessionDate;
      } else {
        item.intraday=points.map(p=>({value:p.close,time:p.time,date:new Date(p.time*1000).toLocaleTimeString('he-IL',{timeZone:result.timezone||'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}));item.intradaySessionDate=result.sessionDate;item.extended=result.extended||null;
      }
      item[field+'Source']=result.source;item[field+'Fetched']=Date.now();item[field+'Error']='';item.exchangeTimezone=result.timezone||item.exchangeTimezone;save();render();
    }catch(e){failures.set(key,Date.now());if(current(g,portfolio)){item[field+'Error']=e.message||errors.unavailable;if(!quiet)status(item[field+'Error']);}}
    finally{pending.delete(key);}
  }
  async function primeHistory(){const g=generation,portfolio=state;for(const item of [...portfolio.items].filter(x=>Number(x.qty)>0)){if(!current(g,portfolio))break;await history(item.symbol,'intraday');if(period!=='day')await history(item.symbol,'daily');}if(current(g,portfolio))render();}
  function reset(){generation++;running=null;refreshed=0;failures.clear();for(const c of controllers)c.abort();}
  function clearQuote(item) {for(const k of ['quoteTime','quoteFetched','quoteSource','quoteKind','quoteSessionDate','quoteFallback','prevClose','dayChange','marketOpen','marketHigh','marketLow','marketVolume','extended'])delete item[k];item.quoteError='';}
  async function diagnose() {
    const output=document.getElementById('quoteTestResult');if(!output)return;output.textContent='בודק את UPS מול שני הספקים…';
    const rows=[];
    for(const provider of ['yahoo','tiingo']){try{const r=await market(['UPS'],provider),q=r.quotes[0];rows.push(q?`${labels[provider]}: ${fmt(q.price)} · ${validPrice(q.prevClose)?fmt((q.price/q.prevClose-1)*100)+'%':'ללא סגירה קודמת'} · ${q.sessionDate} · ${q.quoteKind==='close'?'סגירה':'במהלך המסחר'}`:`${labels[provider]}: ${message(r.errors[0]?.code)}`);}catch(e){rows.push(`${labels[provider]}: ${e.message}`);}}
    if(output.isConnected)output.textContent=rows.join('\n');
  }
  window.marketQuotes={
    onPortfolioLoaded(newUid){reset();uid=newUid;refresh();},onSignOut(){reset();uid='';quoteStatus='';},refreshNow(){return refresh(true);},lookup(parameters){return query('lookup',parameters,'yahoo');},primeHistory,
    onResearch(symbol){history(symbol,'daily');history(symbol,'intraday');},onVisible(symbol){history(symbol,'intraday');},clearQuote,
    openSettings(){
      if(!uid)return;const configured=!!token();
      document.getElementById('modal').innerHTML=`<div class="dialog"><div role="dialog" aria-modal="true" aria-label="ספק נתוני שוק"><h2>שערים וגרפים</h2><form id="quotekeyform"><label for="marketProvider">ספק נתונים</label><select id="marketProvider">${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${key===preference()?'selected':''}>${label}</option>`).join('')}</select><p class="note">אוטומטי: Yahoo תחילה, ו־Tiingo כגיבוי אם הוגדר טוקן תקף. הבחירה נשמרת בחשבון. Yahoo אינו מחייב טוקן; זמינותו עשויה להשתנות.</p><label for="quotekey">טוקן Tiingo · רשות</label><input id="quotekey" type="password" autocomplete="off" placeholder="${configured?'טוקן שמור במכשיר · הזן חדש להחלפה':'נדרש רק לשימוש ב־Tiingo'}"><p class="note">הטוקן נשמר במכשיר הזה. <a href="https://api.tiingo.com/account/api/token" target="_blank" rel="noopener noreferrer">עמוד הטוקן</a> · Tiingo בחינם מגביל בקשות; עדכון סגירות והיסטוריה לכל הרשימה עשוי לדרוש כמה סבבים.</p><details><summary>הגדרות חיבור מתקדמות</summary><label>כתובת המתווך</label><input id="relay" type="url" required value="${esc(relay())}"></details><div id="quoteTestResult" class="note" style="white-space:pre-line" role="status"></div><div class="actions"><button type="button" class="btn" id="closequotes">סגור</button><button type="button" class="btn" id="testquotes">בדיקת חיבור והשוואה</button>${configured?'<button type="button" class="btn" id="clearquotes">מחק טוקן</button>':''}<button class="btn primary">שמור ורענן</button></div></form></div></div>`;
      document.getElementById('closequotes').onclick=close;
      document.getElementById('testquotes').onclick=()=>{const key=document.getElementById('quotekey').value.trim();if(key){if(!/^[A-Za-z0-9_-]{20,100}$/.test(key)){document.getElementById('quoteTestResult').textContent='טוקן לא תקין';return;}localStorage.setItem(storage('token'),key);}diagnose();};
      document.getElementById('clearquotes')?.addEventListener('click',()=>{localStorage.removeItem(storage('token'));this.openSettings();});
      document.getElementById('quotekeyform').onsubmit=e=>{e.preventDefault();let address;try{address=new URL(document.getElementById('relay').value);}catch{alert('כתובת מתווך אינה תקינה');return;}const key=document.getElementById('quotekey').value.trim(),chosen=document.getElementById('marketProvider').value;
        if(address.protocol!=='https:'){alert('יש להזין כתובת HTTPS');return;}if(key&&!/^[A-Za-z0-9_-]{20,100}$/.test(key)){alert('טוקן לא תקין');return;}if(key)localStorage.setItem(storage('token'),key);if(chosen==='tiingo'&&!token()){alert('יש להזין טוקן Tiingo');return;}
        localStorage.setItem(storage('relay'),address.origin+'/');book.marketProvider=chosen;save();reset();close();refresh(true);
      };
    }
  };
})();
