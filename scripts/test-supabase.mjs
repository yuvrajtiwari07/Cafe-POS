import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
// Creates temporary confirmed test accounts without sending email, then deletes them.
// Start npm run dev first. Supply SUPABASE_SECRET_KEY only in the test process environment.
if (!process.env.SUPABASE_SECRET_KEY) throw new Error('Set SUPABASE_SECRET_KEY for integration tests');
const url=process.env.VITE_SUPABASE_URL || 'https://ojsbdothutpuzkkvcfqi.supabase.co';
const pub=process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_cHmnMzUrLXwp1-vYocHqxg_8QBV9jpq';
const admin=createClient(url,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const users=[]; let cafeId; let browser;
const check=(error)=>{if(error)throw new Error(error.message)};
try {
 const sessions=[];
 for (const role of ['owner','staff']) {
  const email=`migration-${role}-${crypto.randomUUID()}@example.test`; const password=crypto.randomUUID()+'Aa1!';
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`Test ${role}`}});check(error);users.push(data.user.id);
  const client=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=await client.auth.signInWithPassword({email,password});check(signed.error);sessions.push(signed.data.session);
 }
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
 const pages=await Promise.all(contexts.map(c=>c.newPage()));const errors=[];
 for(let i=0;i<2;i++){
  pages[i].on('pageerror',e=>errors.push(e.message));
  pages[i].on('console',m=>{if(m.type()==='warning'||m.type()==='error')console.log('Browser',i,m.text().slice(0,300))});
  await pages[i].goto((process.env.TEST_APP_URL || 'http://localhost:3000/'),{waitUntil:'networkidle'});
  await pages[i].evaluate(async session=>{const {supabase}=await import('/src/supabase.ts');const {error}=await supabase.auth.setSession(session);if(error)throw error;},sessions[i]);
  await pages[i].getByText('Welcome to Bill Generator',{exact:true}).waitFor();
 }
 const [owner,staff]=pages;
 await owner.getByRole('button',{name:'+ New Restaurant',exact:true}).click();
 await owner.getByPlaceholder('e.g. The Downtown Diner').fill('Supabase Integration Test');
 await owner.getByRole('button',{name:'Create Restaurant & Become Owner',exact:true}).click();
 await owner.getByText('Welcome to Bill Generator',{exact:true}).waitFor({state:'hidden'});
 const cafe=await owner.evaluate(async()=>{const {getActiveCafe}=await import('/src/services/storage.ts');return getActiveCafe()});cafeId=cafe.id;
 console.log('Restaurant created via UI:',Boolean(cafeId && cafeId!=='default-corner-cafe'));
 await staff.getByRole('button',{name:'Join Existing Place',exact:true}).click();
 await staff.getByPlaceholder('e.g. CAFE-8821').fill(cafe.secretCode);
 await staff.getByRole('button',{name:'Request to Join Restaurant',exact:true}).click();
 await staff.getByText(/Join request sent to the owner/).waitFor();
 console.log('Staff join requested via UI');
 await owner.evaluate(async({cafeId,staffId})=>{
  const {db,doc,getDoc,updateDoc}=await import('/src/database.ts');const c=(await getDoc(doc(db,'cafes',cafeId))).data();
  if(!c.pendingRequests.some(r=>r.uid===staffId))throw new Error('Join request missing');
  await updateDoc(doc(db,'cafes',cafeId),{memberUids:[...c.memberUids,staffId],members:[...c.members,{uid:staffId,name:'Test staff',role:'cashier',email:'staff@example.test',joinedAt:new Date().toISOString()}],pendingRequests:[]});
 },{cafeId,staffId:users[1]});
 await staff.getByText('Welcome to Bill Generator',{exact:true}).waitFor({state:'hidden',timeout:25000});
 console.log('Approval received on second browser');
 await staff.getByText('Table 1',{exact:true}).click();
 await owner.evaluate(async cafeId=>{
  const {db,doc,setDoc}=await import('/src/database.ts');await setDoc(doc(db,'cafes',cafeId,'menu','test-coffee'),{name:'Integration Coffee',price:110,category:'Coffee',isAvailable:true,isVeg:true});
 },cafeId);
 try { await staff.getByText('Integration Coffee',{exact:true}).waitFor({timeout:18000}); }
 catch(e){
 console.log('Staff page:',(await staff.locator('body').innerText()).slice(0,1800));

 throw e;
 }
 console.log('Live menu update reached staff browser');
 await contexts[1].setOffline(true);
 await staff.evaluate(async({cafeId,uid})=>{
  const {saveBillLocally,getPendingQueue}=await import('/src/services/storage.ts');saveBillLocally({id:'integration-offline-bill',cafeId,billNumber:'TEST-1',items:[{name:'Integration Coffee',menuItemId:'test-coffee',price:110,quantity:1,total:110}],subtotal:110,grandTotal:110,discountPercent:0,discountAmount:0,taxPercent:0,taxAmount:0,paymentMode:'cash',status:'paid',orderType:'takeaway',cashierId:uid,cashierName:'Test staff',createdAt:new Date().toISOString(),isSynced:false});
  if(getPendingQueue(cafeId).length!==1)throw new Error('Offline bill not queued');
 },{cafeId,uid:users[1]});
 await contexts[1].setOffline(false);
 await staff.waitForFunction(async cafeId=>{const {getPendingQueue}=await import('/src/services/storage.ts');const {syncEngine}=await import('/src/services/syncEngine.ts');await syncEngine.flushPendingQueue();return getPendingQueue(cafeId).length===0;},cafeId,{timeout:30000});
 await owner.waitForFunction(async cafeId=>{const {db,collection,getDocs}=await import('/src/database.ts');return (await getDocs(collection(db,'cafes',cafeId,'bills'))).size===1;},cafeId,{timeout:20000});
 const count=await owner.evaluate(async cafeId=>{const {db,collection,getDocs}=await import('/src/database.ts');return (await getDocs(collection(db,'cafes',cafeId,'bills'))).size;},cafeId);
 if(count!==1){ console.log('Offline diagnostic:',{count,staff:await staff.evaluate(async cafeId=>{const {getPendingQueue,getActiveCafe,getLocalBills}=await import('/src/services/storage.ts');return {active:getActiveCafe()?.id,queue:getPendingQueue(cafeId).map(b=>b.id),bills:getLocalBills(cafeId).map(b=>({id:b.id,synced:b.isSynced}))}},cafeId)});throw new Error('Offline sync count incorrect');}console.log('Offline bill replayed once:',count);
 await owner.evaluate(async cafeId=>{const {db,doc,getDoc,updateDoc}=await import('/src/database.ts');const c=(await getDoc(doc(db,'cafes',cafeId))).data();await updateDoc(doc(db,'cafes',cafeId),{memberUids:[c.ownerId],members:c.members.filter(m=>m.uid===c.ownerId)});},cafeId);
 await staff.getByText('Welcome to Bill Generator',{exact:true}).waitFor({timeout:25000});console.log('Revoked staff returned to restaurant setup');
 console.log('Runtime errors:',errors);if(errors.length)throw new Error('Browser runtime errors');
} finally {
 if(browser)await browser.close();
 // Remove only records created by this test, even if a browser assertion failed.
 for(const uid of users){const {error}=await admin.from('cafes').delete().eq('owner_id',uid);if(error)console.error('Cleanup cafe:',error.message);await admin.from('join_attempts').delete().eq('user_id',uid);const deleted=await admin.auth.admin.deleteUser(uid);if(deleted.error)console.error('Cleanup user:',deleted.error.message);}
 console.log('Temporary test users and restaurant removed');
}
