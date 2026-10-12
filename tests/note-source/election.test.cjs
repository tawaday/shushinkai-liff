const fs=require('fs'),assert=require('assert');
const {chromium}=require('/Users/kdcneo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:375,height:850}});const errors=[];let apiCalls=0;
 page.on('pageerror',e=>errors.push(e.message));
 const fixture=JSON.parse(fs.readFileSync(require('path').join(__dirname,'closed-response.json')));let response=structuredClone(fixture);
 await page.route('**/*',async route=>{
  const url=route.request().url();
  if(url.includes('sdk.js'))return route.fulfill({body:'window.liff={init:async()=>{},isLoggedIn:()=>true,getIDToken:()=>"fixture"};',contentType:'text/javascript'});
  if(url.includes('friendship.js'))return route.fulfill({body:'window.ShushinkaiFriendship={check:()=>{},show:()=>{}};',contentType:'text/javascript'});
  if(url.includes('script.google.com')){apiCalls++;assert.equal(new URLSearchParams(route.request().postData()).get('action'),'getPageState');return route.fulfill({body:JSON.stringify(response),contentType:'application/json'});}
  if(url.startsWith('http://fixture/index.html'))return route.fulfill({body:'<html>common gate</html>',contentType:'text/html'});
  if(url.startsWith('http://fixture/')){const file=new URL(url).pathname.slice(1);return route.fulfill({body:fs.readFileSync(require('path').join(__dirname,'../..',file)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}
  return route.abort();
 });
 const go=async()=>{await page.goto('http://fixture/election.html?election=chairman_2026');await page.waitForSelector('#loadingView.hidden',{state:'attached',timeout:10000}).catch(async e=>{console.log('Errors',errors,'calls',apiCalls,await page.locator('body').innerText());throw e;});};
 await go();assert.equal(await page.locator('#closedView').isVisible(),true);assert.equal(await page.locator('#closedResultBox').isVisible(),true);
 assert.equal(await page.locator('#closedResultTitle').innerText(),'開票結果');assert.equal(await page.locator('#closedResultElectionName').innerText(),fixture.electionData.election.title);assert(await page.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('closedResultElectionName')).fontSize)<parseFloat(getComputedStyle(document.getElementById('closedResultTitle')).fontSize)));
 const text=await page.locator('#closedResultBox').innerText();for(const item of ['98名','65票','64票','1票','66.3%','鈴木直子氏は信任されました'])assert(text.includes(item),item);
 for(const width of [320,375,430]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'outputs/終了画面-結果公開-'+width+'.png',fullPage:true});}
 response=structuredClone(fixture);response.electionData.election.isResultPublic=false;delete response.electionData.closedResult;await go();assert(await page.locator('#closedView').isVisible());assert(!await page.locator('#closedResultBox').isVisible());await page.screenshot({path:'outputs/終了画面-結果非公開.png',fullPage:true});
 // Reused page: old published data must be removed on refresh.
 await page.evaluate(r=>handlePageStateLoaded_(r),fixture);assert(await page.locator('#closedResultBox').isVisible());await page.evaluate(r=>handlePageStateLoaded_(r),response);assert(!await page.locator('#closedResultBox').isVisible());assert.equal(await page.locator('#closedResultRows').innerText(),'');
 response=structuredClone(fixture);response.state='before';delete response.electionData.closedResult;await go();assert(await page.locator('#beforeView').isVisible());assert(!await page.locator('#closedResultBox').isVisible());
 response=structuredClone(fixture);response.state='open';delete response.electionData.closedResult;await go();assert(await page.locator('#voteView').isVisible());assert(!await page.locator('#closedResultBox').isVisible());assert.equal(await page.locator('#optionList .optionCard').count(),2);
 response=structuredClone(fixture);response.electionData.closedResult.decisionText='<img src=x onerror=alert(1)>';await go();assert.equal(await page.locator('#closedResultDecision img').count(),0);assert((await page.locator('#closedResultDecision').innerText()).includes('<img'));
 response=structuredClone(fixture);response.state='already';delete response.electionData.closedResult;await go();assert(await page.locator('#alreadyVotedView').isVisible());
 assert.deepEqual(errors,[]);assert(apiCalls===6);response={ok:false,notLinked:true};await page.goto('http://fixture/election.html?election=custom_2027');await page.waitForURL('**/index.html?view=vote&election=custom_2027');console.log('PASS direct election entry returns to common gate with election preserved');await browser.close();console.log('PASS: actual browser closed public/private/before/open; result clearing; 320/375/430px; text escaping; no vote writes or external network');
})().catch(e=>{console.error(e);process.exit(1)});
