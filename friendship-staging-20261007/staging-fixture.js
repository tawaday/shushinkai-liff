/* Published staging uses synthetic identities only; no production API is contacted. */
(() => {
  const params = new URLSearchParams(location.search);
  let linked = params.get('linked') !== '0';
  let friend = params.get('friend') !== '0';
  const mode = params.get('mode') || 'available';
  window.stageCalls = [];
  window.liff = {
    init: async () => {}, isLoggedIn: () => true, getIDToken: () => 'STAGING-SYNTHETIC-TOKEN',
    getDecodedIDToken: () => ({exp:Math.floor(Date.now()/1000)+3600}),
    getFriendship: () => mode === 'error' ? Promise.reject(Error('fixture error')) : mode === 'timeout' ? new Promise(()=>{}) : Promise.resolve({friendFlag:friend}),
    isApiAvailable: () => mode !== 'unavailable',
    requestFriendship: async () => { stageCalls.push('requestFriendship'); if(mode === 'reject')throw Error('fixture rejected'); if(mode !== 'cancel')friend = true; },
    closeWindow: () => {}, login: () => {}, logout: () => {}
  };
  if(mode === 'missing')delete liff.requestFriendship;
  const data = {election:{electionId:'staging_fixture',title:'検証用・架空の信任投票',voteType:'confidence',startAt:'2026/10/01',endAt:'2026/10/31'},options:[{optionId:'yes',label:'信任する'},{optionId:'no',label:'信任しない'}],confidenceCandidate:{name:'検証候補',memberId:'TEST'}};
  window.fetch = async (url, opts = {}) => {
    const body = String(opts.body || ''); let input;try{input=JSON.parse(body)}catch(_){input=Object.fromEntries(new URLSearchParams(body));}
    stageCalls.push(input.action || input.fn || 'blocked');
    let out = {ok:false,error:'このstagingでは対応していない操作です。本番への通信は行いません。'};
    if(input.action === 'getPageState')out=linked ? {ok:true,state:'open',electionData:data} : {ok:false,notLinked:true};
    if(input.action === 'linkIdentity'){linked=true;out={ok:true,linked:true};}
    if(input.action === 'castVote'){out={ok:true};}
    if(input.action === 'resolve')out=linked ? {ok:true,view:input.view === 'inquiry' ? 'inquiry' : 'alreadyRegistered',registered:true,memberId:'TEST',memberName:'検証会員',registeredAt:'検証日時'} : {ok:false,notLinked:true};
    if(input.action === 'registrationLookup')out={ok:true,confirmationToken:'TEST',member:{name:'検証会員',clubTerm:'1'}};
    if(input.action === 'registrationConfirm'){linked=true;out={ok:true,memberId:'TEST',memberName:'検証会員',registeredAt:'検証日時'};}
    return {ok:true,text:async()=>JSON.stringify(out),json:async()=>out};
  };
  document.addEventListener('DOMContentLoaded', () => {
    const box=document.createElement('aside');box.style.cssText='background:#fff0c2;padding:14px;font-weight:bold';
    box.textContent='STAGING：架空データによる動作確認です。本人確認・LINE連携・投票は保存されません。友だち追加も模擬動作です。';document.body.prepend(box);
  });
})();
