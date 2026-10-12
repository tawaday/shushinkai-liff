const fs=require('fs'),assert=require('assert');
const {chromium}=require('/Users/kdcneo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const view of ['vote','card','profile','register']) for(const linked of [true,false,'mismatch']) {
  const context=await browser.newContext();const page=await context.newPage();let registered=linked===true;let calls=[];const backend=require('./backend.cjs')(linked===true?'registered':undefined);let errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async r=>{
   const u=new URL(r.request().url());
   if(u.pathname.endsWith('sdk.js'))return r.fulfill({body:'window.liff={init:async()=>{},isLoggedIn:()=>true,getIDToken:()=>"fixture"};',contentType:'text/javascript'});
   if(u.pathname.endsWith('friendship.js'))return r.fulfill({body:'window.ShushinkaiFriendship={check:()=>{},show:()=>{},offerContinuation:f=>f()};',contentType:'text/javascript'});
   if(u.hostname==='script.google.com') {
    const p=new URLSearchParams(r.request().postData());const a=p.get('action');calls.push(a);let result;
    if(a==='resolve')result=!registered?{ok:true,registered:false,view:'register'}:view==='vote'?{ok:true,registered:true,view:'vote'}:view==='register'?{ok:true,registered:true,view:'alreadyRegistered',memberName:'検証会員'}:{ok:true,registered:true,redirectUrl:'http://fixture/destination?view='+view};
    else if(a==='registrationLookup' && linked==='mismatch') result={ok:false,error:'本人確認できませんでした。'};
    else if(a==='registrationLookup') {assert.equal(p.get('entryView'),view);result=backend.lookup(Object.fromEntries(p));}
    else if(a==='registrationConfirm') {result=backend.confirm(Object.fromEntries(p));assert(result.ok);registered=true;assert.equal(backend.note(),{vote:'election_identity_link',card:'liff_card_link',profile:'liff_profile_link',register:'liff_self_registration'}[view]);} else throw Error(a);
    return r.fulfill({body:JSON.stringify(result),contentType:'application/json'});
   }
   if(u.hostname==='fixture') {
    if(u.pathname==='/election.html'||u.pathname==='/destination') return r.fulfill({body:'<html><body>destination</body></html>',contentType:'text/html'});
    const file=u.pathname==='/'?'index.html':u.pathname.slice(1);return r.fulfill({body:fs.readFileSync(require('path').join(__dirname,'../..',file)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
   }return r.abort();
  });
  await page.goto('http://fixture/index.html?view='+view+'&election=custom_2027');
  if(linked!==true) {await page.locator('#name').fill('検証会員');await page.locator('#clubTerm').fill('74');await page.locator('#birthDate').fill('1970-01-01');await page.locator('#lookupButton').click();if(linked==='mismatch'){await page.waitForSelector('#registerError:not(:empty)');assert.equal(calls.includes('registrationConfirm'),false);assert(page.url().includes('index.html'));console.log('PASS',view,'mismatch-no-link');await context.close();continue;}await page.locator('#confirmButton').click();}
  if(view==='vote'){await page.waitForURL('**/election.html?election=custom_2027');assert.equal(calls.filter(x=>x==='resolve').length,linked?1:2);}
  else if(view==='register')await page.waitForSelector('#registered:not(.hidden)');else await page.waitForURL('**/destination?view='+view);
  assert.deepEqual(errors,[]);if(linked===true){assert.equal(backend.note(),'registered');assert.equal(backend.writes.length,0);}console.log('PASS',view,linked?'linked':'lookup-confirm-return');await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
