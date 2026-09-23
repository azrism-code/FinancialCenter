import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
const sync=document.getElementById('sync');
if(firebaseConfig.projectId.startsWith('REPLACE_')){
 sync.textContent='ממתין לחיבור Firebase';
 document.getElementById('signin').disabled=true;
}else{
 const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
 let user=null,saveQueue=Promise.resolve();
 const ref=()=>doc(db,'portfolios',user.uid);
 window.portfolioStore={save(portfolio){if(!user)return Promise.reject(Error('Sign in required'));const snapshot=JSON.parse(JSON.stringify(portfolio));saveQueue=saveQueue.catch(()=>{}).then(()=>setDoc(ref(),{...snapshot,updatedAt:Date.now()}));return saveQueue}};
 document.getElementById('signin').onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(e=>{sync.textContent='הכניסה נכשלה: '+e.code});
 document.getElementById('signout').onclick=()=>signOut(auth);
 onAuthStateChanged(auth,async current=>{user=null;window.unloadPortfolio();if(!current)return;sync.textContent='טוען תיק...';try{const snapshot=await getDoc(doc(db,'portfolios',current.uid));user=current;window.loadPortfolio(current,snapshot.exists()?snapshot.data():{items:[],alerts:[]})}catch(e){sync.textContent='הטעינה נכשלה: '+e.code}});
}
