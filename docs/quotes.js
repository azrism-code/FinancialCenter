// Finnhub API keys stay on this device. Portfolio data stays in the user's Firestore document.
(() => {
  const MAX_QUOTES=50, MIN_REFRESH_MS=5*60*1000;
  let uid='',busy=false,refreshTime=0;
  const keyName=()=>`financial-center-finnhub-${uid}`;
  const status=message=>{quoteStatus=message;render()};
  const eligible=item=>/^[A-Z][A-Z0-9-]{0,14}$/.test(item.symbol);
  const prioritized=()=>[...state.items].filter(eligible).sort((a,b)=>Number(holding(b))-Number(holding(a))).slice(0,MAX_QUOTES);
  async function refresh(force=false){
    if(!remoteReady||busy||!uid)return;
    const apiKey=localStorage.getItem(keyName());
    if(!apiKey){status('להפעלת שערים יש להגדיר מפתח Finnhub');return}
    if(!force&&Date.now()-refreshTime<MIN_REFRESH_MS)return;
    const items=prioritized();if(!items.length){status('אין סימולים אמריקאיים לרענון');return}
    busy=true;refreshTime=Date.now();const activeUid=uid;let updated=0,failed=0,limited=false;
    status(`מעדכן שערים: 0/${items.length}`);
    try{
      for(const item of items){
        if(!remoteReady||uid!==activeUid)break;
        try{
          const url=new URL('https://finnhub.io/api/v1/quote');
          url.searchParams.set('symbol',item.symbol);
          url.searchParams.set('token',apiKey);
          const response=await fetch(url,{cache:'no-store'});
          if(response.status===429){limited=true;break}
          if(!response.ok)throw Error(`HTTP ${response.status}`);
          const result=await response.json();
          if(Number.isFinite(result.c)&&result.c>0&&Number.isFinite(result.t)&&result.t>0){
            item.price=result.c;item.quoteTime=result.t*1000;item.quoteSource='Finnhub';updated++;
          }else failed++;
        }catch{failed++}
        if((updated+failed)%10===0)status(`מעדכן שערים: ${updated+failed}/${items.length}`);
      }
      if(updated&&uid===activeUid)save();
      if(uid===activeUid)status(`${updated} שערים עודכנו${failed?` · ${failed} לא זמינים`:''}${limited?' · הגעת למכסת השירות':''} · ${new Date().toLocaleTimeString('he-IL')}`);
    }finally{busy=false}
  }
  window.marketQuotes={
    onPortfolioLoaded(newUid){uid=newUid;refreshTime=0;refresh()},
    onSignOut(){uid='';busy=false;refreshTime=0;quoteStatus=''},
    openSettings(){
      if(!uid)return;
      const configured=!!localStorage.getItem(keyName());
      document.getElementById('modal').innerHTML=`<div class="dialog"><div role="dialog" aria-modal="true" aria-label="הגדרת שערים"><h2>שערי מניות · Finnhub</h2><p class="note">מתעדכנות עד ${MAX_QUOTES} מניות אמריקאיות, אחזקות תחילה. סימולים מבורסות אחרות ומדדים נשארים עם המחיר השמור. המפתח נשמר במכשיר הזה בלבד ואינו נשלח ל־Firebase.</p><form id="quotekeyform"><label for="quotekey">מפתח API אישי של Finnhub</label><input id="quotekey" type="password" autocomplete="off" placeholder="${configured?'מפתח שמור · הזן חדש להחלפה':'הדבק מפתח'}"><p class="note"><a href="https://finnhub.io/register" target="_blank" rel="noopener noreferrer">פתיחת חשבון Finnhub חינמי</a>. קריאות שער שולחות את הסימולים ומפתח ה־API ל־Finnhub. רענון חוזר מוגבל לחמש דקות.</p><div class="actions"><button type="button" class="btn" id="closequotes">סגור</button>${configured?'<button type="button" class="btn" id="clearquotes">מחק מפתח</button>':''}<button class="btn primary">שמור ורענן</button></div></form></div></div>`;
      document.getElementById('closequotes').onclick=close;
      document.getElementById('clearquotes')?.addEventListener('click',()=>{localStorage.removeItem(keyName());close();status('מפתח Finnhub נמחק מהמכשיר')});
      document.getElementById('quotekeyform').onsubmit=e=>{e.preventDefault();const key=document.getElementById('quotekey').value.trim();if(key){if(!/^[A-Za-z0-9_-]{10,100}$/.test(key)){alert('מפתח Finnhub אינו תקין');return}localStorage.setItem(keyName(),key)}if(!localStorage.getItem(keyName())){alert('יש להזין מפתח');return}close();refreshTime=0;refresh(true)};
    }
  };
})();
