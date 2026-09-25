const { chromium } = require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,...(process.env.FC_CHROMIUM_BINARY?{executablePath:process.env.FC_CHROMIUM_BINARY,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']}:{})});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const problems=[];page.on('pageerror',e=>problems.push(e.message));
await page.route('**/firebase.js',r=>r.fulfill({contentType:'text/javascript',body:'window.portfolioStore={save:async data=>{window.lastSaved=structuredClone(data)}};'}));
await page.route('**/financial-center-quotes.azrism.workers.dev/**',async route=>{
 const u=new URL(route.request().url());
 if(u.searchParams.get('provider')==='tiingo')return route.fulfill({status:403,json:{error:'invalid_token'}});
 if(u.pathname==='/market')return route.fulfill({json:{quotes:u.searchParams.get('symbols').split(',').map(symbol=>({symbol,source:'Yahoo',price:symbol==='UPS'?92.05:21.79,prevClose:symbol==='UPS'?95.82:21.80,quoteTime:Date.now()-3600000,sessionDate:'2026-09-24',quoteKind:'close',currency:'USD',timezone:'America/New_York',name:symbol==='UPS'?'United Parcel Service':'Carnival',open:95.6,high:95.7,low:91.63,volume:8430000})),errors:[]}});
 if(u.pathname==='/series'){const daily=u.searchParams.get('kind')==='daily';return route.fulfill({json:{source:'Yahoo',kind:daily?'daily':'intraday',sessionDate:'2026-09-24',timezone:'America/New_York',points:Array.from({length:79},(_,i)=>({date:daily?new Date(Date.now()-(79-i)*86400000).toISOString().slice(0,10):'2026-09-24',time:1790256600+i*300,close:u.searchParams.get('symbol')==='UPS'?95.6-(95.6-92.05)*i/78:21.8-(21.8-21.79)*i/78,high:95.7,low:91.63,volume:1000})),extended:null}});}
 return route.fulfill({status:404,json:{error:'not_found'}});
});
await page.goto('http://127.0.0.1:8765/');await page.waitForFunction(()=>window.marketQuotes);
await page.evaluate(()=>window.loadPortfolio({uid:'test-user'},{marketProvider:'auto',activePortfolioId:'p1',portfolios:[{id:'p1',name:'תיק לבדיקה',items:[{symbol:'UPS',qty:35,avg:113.25,price:95.65,history:[]},{symbol:'CCL',qty:10,avg:16.4,price:21.69,history:[]}],alerts:[]},{id:'p2',name:'תיק שני',items:[{symbol:'CCL',qty:1,avg:16.4,price:0,history:[]}],alerts:[]}]}));
await page.waitForFunction(()=>document.querySelector('.quote-notice')?.textContent.includes('2/2'));
await page.waitForSelector('.mini-chart');
assert.match(await page.locator('[data-symbol="UPS"]').innerText(),/92.05/);
assert.match(await page.locator('[data-symbol="UPS"]').innerText(),/-3.93/);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
await page.screenshot({path:'/tmp/fc17/portfolio-mobile.png',fullPage:true});
await page.locator('[data-open="UPS"]').click();await page.waitForSelector('.dashboard-chart text');
assert.match(await page.locator('.stock-hero').innerText(),/שעות America\/New_York/);
await page.screenshot({path:'/tmp/fc17/stock-mobile.png',fullPage:true});
await page.locator('#settings').click();await page.locator('#quotes').click();
await page.selectOption('#marketProvider','yahoo');await page.locator('#quotekeyform button.primary').click();
await page.waitForFunction(()=>window.lastSaved?.marketProvider==='yahoo');
await page.locator('#settings').click();await page.locator('#quotes').click();
assert.equal(await page.inputValue('#marketProvider'),'yahoo');
await page.locator('#quotekey').fill('this-is-a-test-token-invalid');await page.locator('#testquotes').click();
await page.waitForFunction(()=>document.querySelector('#quoteTestResult')?.textContent.includes('אינו תקף'));
await page.screenshot({path:'/tmp/fc17/settings-mobile.png',fullPage:true});
await page.locator('#closequotes').click();
// A repeated import cannot replace a provider quote with the old CSV snapshot.
await page.locator('#settings').click();await page.locator('#import').click();
await page.setInputFiles('#csvfile',{name:'portfolio.csv',mimeType:'text/csv',buffer:Buffer.from('Symbol,Current Price,Quantity,Purchase Price,Date\nUPS,95.65,36,113.25,23/09/2026')});
await page.waitForFunction(()=>document.querySelector('#preview')?.textContent.includes('1 סימולים'));
await page.locator('#apply').click();
assert.equal(await page.evaluate(()=>window.lastSaved.portfolios[0].items.find(x=>x.symbol==='UPS').price),92.05);
assert.equal(await page.evaluate(()=>window.lastSaved.portfolios[0].items.find(x=>x.symbol==='UPS').qty),36);
await page.locator('#settings').click();await page.selectOption('#portfolioPicker','p2');
await page.waitForFunction(()=>document.querySelector('.quote-notice')?.textContent.includes('1/1'));
assert.equal(await page.locator('.basic-line').count(),1);
await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'/tmp/fc17/portfolio-desktop.png',fullPage:true});
assert.deepEqual(problems,[]);
console.log('PASS: mobile and desktop layout, daily chart, provider preference, diagnostic errors, reimport protection, portfolio switch');
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
