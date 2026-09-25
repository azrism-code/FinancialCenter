const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('provider preference obeys current Firestore schema and chart cache stays local',async()=>{
 let listener,saved;
 const node={textContent:'',disabled:false},context={window:{unloadPortfolio(){},loadPortfolio(){}},document:{getElementById:()=>node},firebaseConfig:{projectId:'financial-test'},initializeApp:()=>({}),getAuth:()=>({}),getFirestore:()=>({}),GoogleAuthProvider:class{},signInWithPopup:()=>Promise.resolve(),signOut:()=>Promise.resolve(),onAuthStateChanged:(_a,cb)=>listener=cb,getDoc:async()=>({exists:()=>false}),doc:(_db,_path,uid)=>uid,setDoc:async(ref,data)=>{saved={ref,data}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('docs/firebase.js','utf8').replace(/^import .*;\n/gm,''),context);
 await listener({uid:'test-user'});
 await context.window.portfolioStore.save({marketProvider:'yahoo',activePortfolioId:'one',portfolios:[{id:'one',items:[{symbol:'UPS',history:[1,2],historyDates:['a','b'],historyHigh:[2,3],historySource:'Yahoo',intraday:[{time:1,value:2}],intradaySource:'Yahoo',price:92.05}]}]});
 assert.deepEqual(Object.keys(saved.data).sort(),['activePortfolioId','portfolios','updatedAt']);
 assert.equal(saved.data.portfolios[0].marketProvider,'yahoo');assert.equal(saved.data.portfolios[0].items[0].price,92.05);
 assert.equal(Object.keys(saved.data.portfolios[0].items[0]).some(k=>k.startsWith('history')||k.startsWith('intraday')),false);
});
