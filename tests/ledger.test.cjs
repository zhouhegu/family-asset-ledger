const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const themeScript = fs.readFileSync(path.join(__dirname, '..', 'assets', 'theme.js'), 'utf8');
const script = themeScript + '\n' + fs.readFileSync(path.join(__dirname, '..', 'assets', 'i18n.js'), 'utf8') + '\n' + [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const elements = new Map(), storage = new Map(), listeners = {};
const systemEvents = {};
let storageFailure = false;
function element(id) {
  if (elements.has(id)) return elements.get(id);
  const classes = new Set(['hidden']);
  const el = {id, value:'', textContent:'', innerHTML:'', children:[], dataset:{}, attrs:{}, selectedOptions:[], tabIndex:0,
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,force){if(force ?? !classes.has(x))classes.add(x);else classes.delete(x);}},
    focus(){ctx.document.activeElement=el;},select(){},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},
    appendChild(x){this.children.push(x);},querySelectorAll(){return [];},getBoundingClientRect(){return {width:900,height:300};},addEventListener(){},click(){this.clicks=(this.clicks||0)+1;}};
  let inputValue = '';
  Object.defineProperty(el, 'value', {get:()=>inputValue, set:value=>{inputValue=String(value);}});
  elements.set(id,el); return el;
}
let serial=0;
const ctx = vm.createContext({console, assert, Date, Map, Set, Number, Math, JSON, String, Array, Error,
  document:{getElementById:element,createElement:tag=>element(tag+serial++),body:element('body'),documentElement:{lang:'zh-CN',dataset:{}},querySelectorAll:()=>[],activeElement:null},
  window:{addEventListener:(k,fn)=>listeners[k]=fn,requestAnimationFrame:fn=>fn(),matchMedia:()=>({matches:false,addEventListener:(k,fn)=>systemEvents[k]=fn})},
  localStorage:{getItem:k=>storage.get(k)??null,removeItem:k=>storage.delete(k),setItem(k,v){if(storageFailure)throw new Error('模拟存储空间不足');storage.set(k,v);}},
  alert:()=>{},confirm:()=>true,setTimeout:fn=>fn(),
});
vm.runInContext(script,ctx);
vm.runInContext('refreshAllViews = function() {updateHomeState();updateOwnerSelects();};',ctx);
vm.runInContext('var themePaints=0; drawTrendChart = function() {themePaints++;};',ctx);
ctx.changeSystemAppearance = dark => {
  vm.runInContext(`systemAppearance.matches = ${Boolean(dark)};`,ctx);
  systemEvents.change();
};
let passed=0;
function test(name,body){vm.runInContext('{\n'+body+'\n}',ctx);passed++;console.log('PASS '+name);}
test('Existing demo and legacy ledger validate without changing amounts',`
  var base = {members:cloneData(DEFAULT_MEMBERS),assets:cloneData(DEMO_ASSETS),logs:cloneData(DEMO_LOGS),history:cloneData(DEMO_HISTORY),targets:cloneData(DEMO_TARGETS)};
  var clean = prepareBackup(base); assert.deepEqual(clean.assets.map(a=>a.amount),base.assets.map(a=>a.amount));
`);
test('First launch starts empty without storing any sample data',`
  localStorage.removeItem(STORAGE_KEY);initDataStore();refreshAllViews();
  assert.ok(isEmptyLedger());assert.equal(localStorage.getItem(STORAGE_KEY),null);
  assert.equal(state.currency,'CNY');assert.equal(state.members.p1.name,'成员 1');
  assert.equal(document.getElementById('welcomePanel').classList.contains('hidden'),false);
  assert.equal(document.getElementById('ledgerContent').classList.contains('hidden'),true);
  assert.equal(document.getElementById('headerControls').classList.contains('hidden'),true);
  assert.equal(document.getElementById('data-status-badge').textContent,'空账本');
  initDataStore();assert.ok(isEmptyLedger());
`);
test('Viewing an example from an empty ledger never stores or merges sample records',`
  viewDemo();
  assert.equal(state.isDemo,true);assert.equal(state.assets.length,DEMO_ASSETS.length);
  assert.equal(document.getElementById('demoBanner').classList.contains('hidden'),false);
  assert.equal(localStorage.getItem(STORAGE_KEY),null);
  assert.throws(()=>commitLedger(cloneData(clean),{allowRecovery:true}),/示例仅供查看/);
  exitDemo();assert.ok(isEmptyLedger());assert.equal(localStorage.getItem(STORAGE_KEY),null);
  assert.equal(state.isDemo,false);assert.equal(state.members.p1.name,'成员 1');
  assert.equal(document.getElementById('welcomePanel').classList.contains('hidden'),false);
`);
test('Unsaved starter member labels follow language while saved names remain unchanged',`
  setLanguage('en');assert.equal(state.members.p1.name,'Member 1');
  assert.equal(localStorage.getItem(STORAGE_KEY),null);
  viewDemo();setLanguage('zh-CN');exitDemo();assert.equal(state.members.p1.name,'成员 1');
  commitLedger({...ledgerPayload(),members:{p1:{id:'p1',name:'Alex'},p2:{id:'p2',name:'Sam'}}});
  setLanguage('en');assert.equal(state.members.p1.name,'Alex');setLanguage('zh-CN');
`);
test('Names trim, IDs stay stable and invalid names are rejected',`
  var members = resolveMembers({p1:{id:'p1',name:'  小张  '},p2:{id:'p2',name:'小李'}});
  assert.equal(members.p1.name,'小张'); assert.equal(members.p2.id,'p2');
  assert.throws(()=>resolveMembers({p1:{name:' '},p2:{name:'小李'}}));
  assert.throws(()=>resolveMembers({p1:{id:'p2',name:'小张'},p2:{name:'小李'}}));
  assert.throws(()=>resolveMembers({p1:{name:'1234567890123'},p2:{name:'小李'}}));
`);
test('Saving names persists without touching assets and updates options safely',`
  Object.assign(state,cloneData(clean));
  openSettingsModal();
  var amountsBefore=JSON.stringify(state.assets);
  document.getElementById('settingP1Name').value='  小张  ';
  document.getElementById('settingP2Name').value='<b>小李</b>';
  saveSettings();
  assert.equal(state.members.p1.name,'小张'); assert.equal(JSON.stringify(state.assets),amountsBefore);
  assert.ok(document.getElementById('newAssetOwner').innerHTML.includes('&lt;b&gt;小李&lt;/b&gt;'));
  initDataStore(); assert.equal(state.members.p2.name,'<b>小李</b>');
`);
test('Cancel and blank-name validation leave saved members unchanged',`
  var savedName=state.members.p2.name;
  openSettingsModal(); document.getElementById('settingP2Name').value='未保存'; closeSettingsModal();
  assert.equal(state.members.p2.name,savedName);
  openSettingsModal(); document.getElementById('settingP2Name').value='  '; saveSettings();
  assert.equal(state.members.p2.name,savedName); assert.equal(document.getElementById('settingP2Name').attrs['aria-invalid'],'true');
`);
test('Backup round-trip includes members, ownership, balances and history',`
  var exported=createBackup(); var restored=prepareBackup(JSON.parse(JSON.stringify(exported)));
  for(const key of ['currency','members','assets','history','logs','targets']) assert.deepEqual(restored[key],state[key]);
`);
test('Old backup without members retains current names',`
  var old=cloneData(base);delete old.members;
  assert.deepEqual(prepareBackup(old).members,state.members);
`);
test('Empty ledger is valid and remains empty after reload',`
  var empty=prepareBackup({assets:[],logs:[],history:{},targets:cloneData(DEMO_TARGETS)});
  commitLedger(empty);initDataStore();assert.equal(state.assets.length,0);assert.equal(state.logs.length,0);
`);
test('Missing historical sections do not mix unrelated current data',`
  Object.assign(state,cloneData(clean));
  var sparse=prepareBackup({assets:[]}); assert.equal(sparse.logs.length,0);assert.equal(sparse.history.all.length,0);
`);
test('Invalid backup variants are rejected without mutation',`
  var previous=JSON.stringify(ledgerPayload());
  for(const mutate of [
    x=>x.assets[0].owner='missing',x=>x.assets[1].id=x.assets[0].id,
    x=>x.assets[0].amount=-1,x=>x.assets[0].amount=Infinity,x=>x.assets[0].category='unknown',
    x=>x.logs[0].diff='bad',x=>x.history.all[0].netWorth=1,x=>x.history.all[0].date='2026-02-30',
    x=>x.targets.cash.min=101,x=>x.members.p2.name=5,x=>x.version='99',x=>x.assets[0].isLiability=true,
    x=>x.logs[0].pairedOwner='missing',x=>x.logs[0].id=');alert(1)'
  ]) {var bad=cloneData(base);mutate(bad);assert.throws(()=>prepareBackup(bad));}
  assert.equal(JSON.stringify(ledgerPayload()).replace(/"savedAt":"[^"]+"/,'"savedAt":""'),previous.replace(/"savedAt":"[^"]+"/,'"savedAt":""'));
`);
storageFailure=true;
test('Storage failure leaves the entire live ledger unchanged',`
  var live=JSON.stringify(state); var candidate=cloneData(clean);candidate.members.p2.name='不得保存';
  assert.throws(()=>commitLedger(candidate)); assert.equal(JSON.stringify(state),live);
`);
storageFailure=false;
test('Unreadable saved data is preserved rather than reset to demo',`
  localStorage.setItem(STORAGE_KEY,'{broken');initDataStore();
  assert.equal(localStorage.getItem(STORAGE_KEY),'{broken');assert.equal(state.storageReadError,true);
  assert.throws(()=>commitLedger(cloneData(clean)), /读取失败/);
  localStorage.setItem(STORAGE_KEY,JSON.stringify(createBackup(clean)));initDataStore();
  assert.equal(state.storageReadError,false);
`);
test('Legacy repayment records retain their saved facts without inference or balance changes',`
  var legacy=cloneData(base);
  legacy.logs=[{id:101,owner:'share',date:'2026-09-08',assetName:'旧房贷',type:'还贷本金',diff:-8500,desc:'历史备注',isIncome:false,isLiability:true,pendingCheck:true,netImpact:null}];
  var restored=prepareBackup(legacy);
  assert.equal(JSON.stringify(restored.logs),JSON.stringify(legacy.logs));
  assert.deepEqual(restored.assets.map(a=>a.amount),legacy.assets.map(a=>a.amount));
  assert.equal(JSON.stringify(prepareBackup(createBackup(restored)).logs),JSON.stringify(legacy.logs));
`);
test('Old paired-account metadata round-trips without replaying a payment',`
  var legacy=cloneData(base);legacy.version='2.2';legacy.currency='CNY';legacy.assets[0].amount=171000;
  legacy.logs=[{id:102,assetId:13,owner:'share',date:'2026-09-08',assetName:'旧房贷',type:'还本付息扣款',diff:-8500,desc:'已付款',isIncome:false,isLiability:true,hasPairedAccount:true,pairedAssetId:1,pairedOwner:'p1',pairedDiff:-9000,interestPaid:500,netImpact:-500,pendingCheck:false}];
  var restored=prepareBackup(legacy);commitLedger(restored);initDataStore();
  assert.equal(state.assets[0].amount,171000);
  assert.equal(JSON.stringify(state.logs),JSON.stringify(legacy.logs));
  assert.equal(JSON.stringify(prepareBackup(createBackup()).logs),JSON.stringify(legacy.logs));
`);
test('Account names and legacy reason text never rewrite a stored change',`
  var legacy=cloneData(base);
  legacy.logs=[{id:103,owner:'share',date:'2026-09-08',assetName:base.assets[12].name,type:'资金存入',diff:-5000,desc:'新增负债账目录入',netImpact:-5000,isLiability:true}];
  const restored=prepareBackup(legacy);
  assert.equal(restored.logs[0].diff,-5000);assert.equal(restored.logs[0].pendingCheck,undefined);
  assert.equal(JSON.stringify(restored.logs),JSON.stringify(legacy.logs));
`);
test('Changing a debt balance updates only that account and records the entered difference',`
  var paid=buildValuationUpdate(clean,13,1491500,'还款',false,'9月余额');
  assert.equal(paid.assets.find(a=>a.id===13).amount,1491500);
  for(const asset of clean.assets.filter(a=>a.id!==13)) assert.deepEqual(paid.assets.find(a=>a.id===asset.id),asset);
  assert.equal(paid.logs.length,clean.logs.length+1);assert.equal(paid.logs[0].diff,-8500);
  assert.equal(paid.logs[0].desc,'9月余额');
  for(const key of ['pendingCheck','netImpact','pairedAssetId','interestPaid','hasPairedAccount']) assert.equal(key in paid.logs[0],false);
  assert.equal(paid.history.all.at(-1).netWorth,5360900);
`);
test('Debt balances can be cleared regardless of other account balances or descriptive reason',`
  const cleared=buildValuationUpdate(clean,13,0,'新增借款',false,'余额修正');
  assert.equal(cleared.assets.find(a=>a.id===13).amount,0);assert.equal(cleared.assets.find(a=>a.id===1).amount,180000);
  const raised=buildValuationUpdate(clean,13,1510000,'还款',false,'按账单更新');
  assert.equal(raised.assets.find(a=>a.id===13).amount,1510000);assert.equal(raised.logs[0].diff,10000);
`);
test('Reasons are optional and only invalid numbers prevent a balance update',`
  const next=buildValuationUpdate(clean,13,1490000);
  assert.equal(next.logs[0].type,'余额更新');assert.equal(next.logs[0].isIncome,false);
  const original=JSON.stringify(clean);
  for(const amount of [-1,Infinity,NaN,Number.MAX_SAFE_INTEGER]) assert.throws(()=>buildValuationUpdate(clean,13,amount));
  assert.equal(JSON.stringify(clean),original);
`);
test('Same saved balance produces no duplicate record and changes survive reload',`
  assert.equal(buildValuationUpdate(paid,13,1491500),null);
  commitLedger(paid);var balance=JSON.stringify(state.assets);initDataStore();
  assert.equal(JSON.stringify(state.assets),balance);assert.equal(state.logs.length,paid.logs.length);
`);
test('Activity displays recorded debt differences without review labels or inferred impact',`
  Object.assign(state,cloneData(clean),{selectedMember:'all',isPrivacy:false});
  state.logs=[{id:104,owner:'share',date:'2026-09-08',assetName:'测试负债',type:'偿还本金',diff:-8500,desc:'账单余额',isLiability:true,pendingCheck:true,netImpact:8500}];
  renderActivityLogs();const markup=document.getElementById('recentChangesList').children.at(-1).innerHTML;
  assert.ok(markup.includes('- ¥ 8,500'));assert.ok(markup.includes('余额变动'));
  assert.ok(!markup.includes('待核对'));assert.ok(!markup.includes('净资产影响'));
  state.isPrivacy=true;renderActivityLogs();
  assert.ok(!document.getElementById('recentChangesList').children.at(-1).innerHTML.includes('8,500'));
  state.isPrivacy=false;
`);
test('Year-to-date baseline remains unchanged when horizon changes',`
  var baseline=JSON.stringify(getYtdBaseline(cloneData(DEMO_HISTORY.all),2026));
  state.horizon='all';assert.equal(JSON.stringify(getYtdBaseline(cloneData(DEMO_HISTORY.all),2026)),baseline);
`);
test('Restore input supports choosing the same file again',`
  document.getElementById('importFileInput').value='old.json';triggerImportFileInput();
  assert.equal(document.getElementById('importFileInput').value,'');assert.equal(document.getElementById('importFileInput').clicks,1);
`);
// Exercise the asynchronous import event with a fake file reader, never a real browser ledger.
ctx.FileReader = class {readAsText(file){this.onload({target:{result:file.text}});}};
test('Malformed JSON and cancelled confirmation leave storage untouched',`
  var stored=localStorage.getItem(STORAGE_KEY);handleImportFileSelected({target:{files:[{text:'{bad'}],value:'x'}});assert.equal(localStorage.getItem(STORAGE_KEY),stored);
  confirm=()=>false;handleImportFileSelected({target:{files:[{text:JSON.stringify(createBackup(clean))}],value:'x'}});assert.equal(localStorage.getItem(STORAGE_KEY),stored);confirm=()=>true;
`);
test('Import event restores a valid backup and clears file selection',`
  var input={files:[{text:JSON.stringify(createBackup(clean))}],value:'chosen.json'};
  handleImportFileSelected({target:input});assert.deepEqual(state.assets,clean.assets);assert.equal(input.value,'');assert.ok(document.getElementById('data-feedback').textContent.includes('恢复成功'));
`);
storageFailure=true;
test('Import storage failure keeps old data and reports failure',`
  var beforeImport=JSON.stringify(state.assets);var importInput={files:[{text:JSON.stringify(createBackup(paid))}],value:'chosen.json'};
  handleImportFileSelected({target:importInput});assert.equal(JSON.stringify(state.assets),beforeImport);assert.ok(document.getElementById('data-feedback').textContent.includes('恢复失败'));assert.equal(importInput.value,'');
`);
storageFailure=false;
ctx.setStorageFailure = value => {storageFailure=value;};
vm.runInContext(`
  function durableState() {
    const data = ledgerPayload(); delete data.savedAt;
    return JSON.stringify(data);
  }
  function resetFixture() { commitLedger(cloneData(clean), {allowRecovery:true}); }
  function fillNewAsset(amount = '123.45') {
    document.getElementById('newAssetName').value = '测试账户';
    document.getElementById('newAssetAmount').value = amount;
    document.getElementById('newAssetCategory').value = 'cash';
    document.getElementById('newAssetOwner').value = 'p1';
  }
`,ctx);
test('Read failure blocks settings, new assets, targets and deletion without losing raw storage',`
  localStorage.setItem(STORAGE_KEY,'{broken');initDataStore();
  var unreadableState=durableState();
  document.getElementById('settingP1Name').value='测试甲';document.getElementById('settingP2Name').value='测试乙';
  saveSettings();assert.ok(document.getElementById('settings-feedback').textContent.includes('读取失败'));
  fillNewAsset();saveNewAsset();assert.ok(document.getElementById('add-feedback').textContent.includes('读取失败'));
  openTargetConfigModal();saveTargetConfig();deleteAsset(1);
  assert.equal(localStorage.getItem(STORAGE_KEY),'{broken');assert.equal(durableState(),unreadableState);
  assert.equal(state.storageReadError,true);
`);
test('Invalid, cancelled and failed imports preserve an unreadable ledger',`
  handleImportFileSelected({target:{files:[{text:'{}'}],value:'bad.json'}});
  confirm=()=>false;handleImportFileSelected({target:{files:[{text:JSON.stringify(createBackup(clean))}],value:'valid.json'}});confirm=()=>true;
  setStorageFailure(true);
  handleImportFileSelected({target:{files:[{text:JSON.stringify(createBackup(clean))}],value:'valid.json'}});
  setStorageFailure(false);
  assert.equal(localStorage.getItem(STORAGE_KEY),'{broken');assert.equal(state.storageReadError,true);
`);
test('Confirmed valid import recovers an unreadable ledger and permits editing again',`
  handleImportFileSelected({target:{files:[{text:JSON.stringify(createBackup(clean))}],value:'valid.json'}});
  assert.equal(state.storageReadError,false);assert.deepEqual(state.assets,clean.assets);
  openSettingsModal();document.getElementById('settingP1Name').value='恢复后姓名';saveSettings();initDataStore();
  assert.equal(state.members.p1.name,'恢复后姓名');assert.deepEqual(state.assets,clean.assets);
`);
test('Example preview preserves unreadable storage and returns to recovery mode',`
  localStorage.setItem(STORAGE_KEY,'{broken');initDataStore();
  setStorageFailure(true);viewDemo();exitDemo();setStorageFailure(false);
  assert.equal(localStorage.getItem(STORAGE_KEY),'{broken');assert.equal(state.storageReadError,true);
  assert.equal(document.getElementById('welcomePanel').classList.contains('hidden'),true);
  commitLedger(cloneData(clean),{allowRecovery:true});
`);
test('Preview and return preserve the entire saved ledger and the current view',`
  resetFixture();const before=durableState(),stored=localStorage.getItem(STORAGE_KEY);
  state.selectedMember='p2';state.selectedCategory='cash';state.searchQuery='test';
  state.horizon='all';state.isPrivacy=true;state.showDebtSeries=true;
  viewDemo();assert.equal(state.isDemo,true);viewDemo();
  assert.equal(state.selectedMember,'all');assert.equal(state.searchQuery,'');
  setCurrency('USD');saveSettings();exportBackupJson();
  assert.equal(localStorage.getItem(STORAGE_KEY),stored);
  const input={files:[{text:JSON.stringify(createBackup(clean))}],value:'test.json'};
  handleImportFileSelected({target:input});assert.equal(input.value,'');
  exitDemo();assert.equal(durableState(),before);assert.equal(state.selectedMember,'p2');
  assert.equal(state.selectedCategory,'cash');assert.equal(state.searchQuery,'test');
  assert.equal(state.horizon,'all');assert.equal(state.isPrivacy,true);assert.equal(state.showDebtSeries,true);
  assert.equal(document.getElementById('assetSearchInput').value,'test');
  assert.equal(document.getElementById('chk-show-debt').checked,true);
  viewDemo();initDataStore();assert.equal(state.isDemo,false);assert.equal(durableState(),before);
  state.selectedMember='all';state.selectedCategory='all';state.searchQuery='';
  state.isPrivacy=false;state.showDebtSeries=false;state.horizon='ytd';
`);
test('Adding the first account creates only user data and survives reload',`
  localStorage.removeItem(STORAGE_KEY);initDataStore();
  fillNewAsset();saveNewAsset();
  assert.equal(state.assets.length,1);assert.equal(state.logs.length,1);
  assert.equal(state.assets[0].name,'测试账户');
  assert.equal(document.getElementById('welcomePanel').classList.contains('hidden'),true);
  initDataStore();assert.equal(state.assets.length,1);assert.equal(state.logs.length,1);
  assert.ok(state.history.all.length>0);assert.ok(state.assets.every(a=>a.name==='测试账户'));
`);
test('Import entry opens backup management and the picker without changing an empty ledger',`
  localStorage.removeItem(STORAGE_KEY);initDataStore();
  const clicks=document.getElementById('importFileInput').clicks||0;
  openImportBackup();assert.equal(document.getElementById('importFileInput').clicks,clicks+1);
  assert.equal(document.getElementById('dataModal').classList.contains('hidden'),false);
  const input={files:[{text:JSON.stringify(createBackup(clean))}],value:'ledger.json'};
  handleImportFileSelected({target:input});initDataStore();assert.deepEqual(state.assets,clean.assets);
`);
test('All ordinary save entry points keep assets, logs, snapshots and storage unchanged on write failure',`
  for (const action of ['add','edit','delete','target','settings','valuation']) {
    resetFixture();fillNewAsset();openEditAssetModal(1);openTargetConfigModal();openSettingsModal();
    document.getElementById('editAssetName').value='不得保存';
    document.getElementById('cfg-cash-min').value='0';
    document.getElementById('settingP1Name').value='不得保存';document.getElementById('settingP2Name').value='测试乙';
    state.editingAssetId=13;
    document.getElementById('valModalNewAmount').value='1491500';
    document.getElementById('valModalReasonSelect').value='还款';
    const before=durableState(), stored=localStorage.getItem(STORAGE_KEY);
    setStorageFailure(true);
    if(action==='add')saveNewAsset();
    if(action==='edit')saveEditAsset();
    if(action==='delete')deleteAsset(1);
    if(action==='target')saveTargetConfig();
    if(action==='settings')saveSettings();
    if(action==='valuation')saveValuationUpdate();
    setStorageFailure(false);
    assert.equal(durableState(),before,action);assert.equal(localStorage.getItem(STORAGE_KEY),stored,action);
    if(action==='add')assert.equal(document.getElementById('newAssetAmount').value,'123.45');
  }
`);
test('Retrying a failed asset save creates one asset and one log, then survives reload',`
  commitLedger(prepareBackup({assets:[]}));fillNewAsset('123.456');
  setStorageFailure(true);saveNewAsset();setStorageFailure(false);saveNewAsset();initDataStore();
  assert.equal(state.assets.length,1);assert.equal(state.logs.length,1);
  assert.equal(state.assets[0].amount,123.46);assert.equal(state.logs[0].diff,123.46);
  assert.equal(state.logs[0].assetId,state.assets[0].id);
  assert.equal(state.history.all.at(-1).netWorth,123.46);
  assert.equal(state.assets[0].updatedAt,localDate());
  assert.deepEqual(prepareBackup(createBackup()).assets,state.assets);
`);
test('Asset IDs remain unique when imported IDs are ahead of the clock',`
  const future=prepareBackup({assets:[]});
  future.assets=[{id:8000000000000000,name:'旧账户',category:'cash',owner:'p1',amount:1,lastDiff:0,updatedAt:localDate(),institution:'',note:'',isLiability:false}];
  future.logs=[{id:8000000000000000,date:localDate(),owner:'p1',diff:1,type:'资金存入',assetName:'旧账户',desc:''}];
  commitLedger(future);fillNewAsset('1');saveNewAsset();fillNewAsset('2');saveNewAsset();initDataStore();
  assert.equal(state.assets.length,3);assert.equal(new Set(state.assets.map(a=>a.id)).size,3);
  assert.equal(state.logs.length,3);assert.equal(new Set(state.logs.map(l=>l.id)).size,3);
`);
test('Invalid amounts cannot change or corrupt a valid saved ledger',`
  resetFixture();const before=durableState(),stored=localStorage.getItem(STORAGE_KEY);
  for(const value of ['', ' ', '-1','NaN','Infinity','1e309','100000000000000','123abc']) {
    fillNewAsset(value);saveNewAsset();
    assert.equal(durableState(),before,value);assert.equal(localStorage.getItem(STORAGE_KEY),stored,value);
    assert.equal(document.getElementById('addAmountError').classList.contains('hidden'),false,value);
  }
  initDataStore();assert.equal(state.storageReadError,false);
`);
test('A zero balance can be saved and restored without becoming demo data',`
  commitLedger(prepareBackup({assets:[]}));fillNewAsset('0');saveNewAsset();initDataStore();
  assert.equal(state.assets.length,1);assert.equal(state.assets[0].amount,0);
  assert.equal(state.history.all.at(-1).netWorth,0);
`);
test('Totals outside the supported range are rejected before the ledger is replaced',`
  commitLedger(prepareBackup({assets:[]}));fillNewAsset('60000000000000');saveNewAsset();
  const before=durableState(),stored=localStorage.getItem(STORAGE_KEY);
  fillNewAsset('60000000000000');saveNewAsset();
  assert.equal(durableState(),before);assert.equal(localStorage.getItem(STORAGE_KEY),stored);
  initDataStore();assert.equal(state.storageReadError,false);assert.equal(state.assets.length,1);
`);
test('Invalid and incomplete target ranges leave saved targets intact',`
  resetFixture();const before=durableState(),stored=localStorage.getItem(STORAGE_KEY);
  for(const [min,max] of [['99','1'],['-1','15'],['5','101'],['','15'],['5',''],['NaN','15'],['5','Infinity']]) {
    openTargetConfigModal();document.getElementById('cfg-cash-min').value=min;document.getElementById('cfg-cash-max').value=max;saveTargetConfig();
    assert.equal(durableState(),before);assert.equal(localStorage.getItem(STORAGE_KEY),stored);
    assert.ok(document.getElementById('target-feedback').textContent);
  }
  initDataStore();assert.equal(state.storageReadError,false);
`);
test('Zero and 100 percent targets survive saving, reload and backup restore',`
  resetFixture();openTargetConfigModal();
  document.getElementById('cfg-cash-min').value='0';document.getElementById('cfg-cash-max').value='0';
  document.getElementById('cfg-equity-min').value='0';document.getElementById('cfg-equity-max').value='100';
  saveTargetConfig();initDataStore();assert.equal(state.storageReadError,false);
  assert.equal(state.targets.cash.min,0);assert.equal(state.targets.cash.max,0);
  assert.equal(state.targets.fund.min,0);assert.equal(state.targets.fund.max,100);
  assert.deepEqual(prepareBackup(createBackup()).targets,state.targets);
`);
test('Editing and deleting an asset persist consistent daily snapshots',`
  commitLedger(prepareBackup({assets:[]}));fillNewAsset('100');saveNewAsset();
  const id=state.assets[0].id;openEditAssetModal(id);
  document.getElementById('editAssetName').value='测试负债';document.getElementById('editAssetCategory').value='debt';document.getElementById('editAssetOwner').value='share';
  saveEditAsset();initDataStore();
  assert.equal(state.assets[0].isLiability,true);assert.equal(state.assets[0].amount,100);
  assert.equal(state.history.all.at(-1).netWorth,-100);assert.equal(state.history.p1.at(-1).netWorth,0);
  deleteAsset(id);initDataStore();assert.equal(state.assets.length,0);
  assert.equal(state.history.all.at(-1).netWorth,0);assert.equal(state.history.share.at(-1).netWorth,0);
`);
test('Language selection respects saved preferences and browser fallback', `
  assert.equal(resolveLanguage('en','zh-CN'),'en');
  assert.equal(resolveLanguage('zh-CN','en-US'),'zh-CN');
  assert.equal(resolveLanguage(null,'zh-TW'),'zh-CN');
  assert.equal(resolveLanguage('invalid','de-DE'),'en');
`);
test('Switching languages changes labels without writing or mutating ledger data', `
  resetFixture();
  const before=JSON.stringify(state), saved=localStorage.getItem(STORAGE_KEY);
  setLanguage('en');
  assert.equal(document.documentElement.lang,'en');
  assert.equal(localStorage.getItem(LANGUAGE_KEY),'en');
  assert.equal(loadLanguage(),'en');
  assert.equal(document.getElementById('btn-privacy').attrs['aria-label'],'Hide amounts');
  assert.ok(document.getElementById('newAssetOwner').innerHTML.includes('Me ('));
  assert.equal(JSON.stringify(state),before);assert.equal(localStorage.getItem(STORAGE_KEY),saved);
  setLanguage('zh-CN');assert.equal(document.documentElement.lang,'zh-CN');
  assert.equal(JSON.stringify(state),before);assert.equal(localStorage.getItem(STORAGE_KEY),saved);
`);
storageFailure=true;
test('Language switches remain usable when preference storage fails', `
  const before=JSON.stringify(state);
  setLanguage('en');assert.equal(t('保存目标'),'Save targets');assert.equal(JSON.stringify(state),before);
`);
storageFailure=false;
test('English balance updates keep user-selected reasons and account values independent', `
  setLanguage('en');
  assert.throws(()=>validateTargets({}),/minimum/);
  assert.throws(()=>prepareBackup({assets:[{id:1,name:'x',amount:-1}]}),/Asset 1/);
  const next=buildValuationUpdate(clean,13,1499000,'还款',false,'');
  assert.equal(next.assets.find(a=>a.id===13).amount,1499000);
  assert.equal(next.assets.find(a=>a.id===1).amount,180000);
  assert.equal(next.logs[0].type,'还款');
  assert.equal(next.logs[0].netImpact,undefined);
  assert.equal(t(next.logs[0].type),'Repayment');
  assert.deepEqual(prepareBackup(createBackup(next)).assets,next.assets);
  setLanguage('zh-CN');assert.equal(t(next.logs[0].type),'还款');
`);
test('Compact amounts adapt units without changing currency or numeric values', `
  setLanguage('en');assert.equal(compactAmount(3420000),'3.4M');assert.equal(fmtMoney(1234.5),'¥ 1,234.5');
  setLanguage('zh-CN');assert.equal(compactAmount(3420000),'342万');assert.equal(fmtMoney(1234.5),'¥ 1,234.5');
`);
test('User notes stay literal while generated activity descriptions translate', `
  setLanguage('en');
  assert.equal(logDescription({type:'资金转入',desc:'取消'}),'取消');
  assert.equal(logDescription({type:'资金转入',desc:'资金转入'}),'Deposit');
  assert.equal(institutionLabel('自主管理'),'Self-managed');
  assert.equal(institutionLabel('测试机构'),'测试机构');
  assert.equal(t('constructor'),'constructor');assert.equal(t('__proto__'),'__proto__');
  setLanguage('zh-CN');
`);
test('English demo content is localized only when creating a demo', `
  setLanguage('en');const demo=createDemoLedger();
  assert.equal(demo.members.p1.name,'Alex');assert.equal(demo.assets[12].name,'Home mortgage');
  assert.equal(JSON.stringify(demo.assets.map(a=>a.amount)),JSON.stringify(DEMO_ASSETS.map(a=>a.amount)));
  assert.equal(demo.logs[0].assetName,demo.assets[6].name);
  const text=JSON.stringify(demo);setLanguage('zh-CN');assert.equal(JSON.stringify(demo),text);
  assert.equal(createDemoLedger().assets[0].name,DEMO_ASSETS[0].name);
`);
test('English backup confirmation can be cancelled without changing ledger data', `
  setLanguage('en');const previous=durableState();let confirmation='';
  const originalConfirm=confirm;confirm=message=>{confirmation=message;return false;};
  const input={files:[{text:JSON.stringify(createBackup(clean))}],value:'test.json'};
  handleImportFileSelected({target:input});confirm=originalConfirm;
  assert.ok(confirmation.startsWith('This will replace assets'));
  assert.equal(durableState(),previous);assert.equal(input.value,'');
  setLanguage('zh-CN');
`);
test('Currency settings persist without converting balances, history or transactions', `
  resetFixture();const before=JSON.parse(durableState());
  updateCurrencyLabels();assert.equal(document.getElementById('currencySelect').value,'CNY');
  setCurrency('USD');initDataStore();
  assert.equal(state.currency,'USD');
  for(const key of ['members','assets','history','logs','targets']) assert.equal(JSON.stringify(state[key]),JSON.stringify(before[key]));
  assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEY)).currency,'USD');
  assert.equal(createBackup().version,'2.3');assert.equal(prepareBackup(createBackup()).currency,'USD');
  assert.equal(createDemoLedger().currency,'USD');
`);
test('Invalid and failed direct currency changes preserve the saved ledger and restore the control', `
  const before=durableState(), stored=localStorage.getItem(STORAGE_KEY);
  document.getElementById('currencySelect').value='INVALID';setCurrency('INVALID');
  assert.ok(document.getElementById('preferences-feedback').textContent.includes('币种无效'));
  assert.equal(document.getElementById('currencySelect').value,'USD');
  assert.equal(durableState(),before);assert.equal(localStorage.getItem(STORAGE_KEY),stored);
  document.getElementById('currencySelect').value='EUR';setStorageFailure(true);setCurrency('EUR');setStorageFailure(false);
  assert.equal(durableState(),before);assert.equal(localStorage.getItem(STORAGE_KEY),stored);
  assert.equal(document.getElementById('currencySelect').value,'USD');
  setCurrency('EUR');initDataStore();assert.equal(state.currency,'EUR');
  assert.equal(document.getElementById('currencySelect').value,'EUR');
`);
test('Member settings save independently of currency and appearance', `
  const before=JSON.parse(durableState());
  openSettingsModal();document.getElementById('settingP1Name').value='Alex';saveSettings();
  assert.equal(state.currency,'EUR');assert.equal(state.members.p1.name,'Alex');
  for(const key of ['assets','history','logs','targets']) assert.equal(JSON.stringify(state[key]),JSON.stringify(before[key]));
`);
test('Legacy backups default to CNY while invalid or missing new currency metadata is rejected', `
  const before=durableState();
  for(const version of [undefined,'1.0','2.0','2.1']) {
    const legacy=cloneData(base);legacy.version=version;
    assert.equal(prepareBackup(legacy).currency,'CNY');
  }
  for(const currency of ['',null,123,'usd','ZZZ','<USD>']) {
    const invalid=createBackup();invalid.currency=currency;
    assert.throws(()=>prepareBackup(invalid),/币种无效/);
  }
  for(const version of ['2.2','2.3']) {
    const missing=createBackup();missing.version=version;delete missing.currency;
    assert.throws(()=>prepareBackup(missing),/缺少币种/);
  }
  assert.equal(durableState(),before);
`);
test('Currency restore is atomic and restoring an old backup also restores its CNY meaning', `
  const candidate=createBackup();candidate.currency='GBP';
  const before=durableState(), stored=localStorage.getItem(STORAGE_KEY);
  const importCandidate=()=>handleImportFileSelected({target:{files:[{text:JSON.stringify(candidate)}],value:'currency.json'}});
  setStorageFailure(true);importCandidate();setStorageFailure(false);
  assert.equal(durableState(),before);assert.equal(localStorage.getItem(STORAGE_KEY),stored);
  importCandidate();initDataStore();assert.equal(state.currency,'GBP');
  const legacy=cloneData(base);legacy.version='2.1';
  handleImportFileSelected({target:{files:[{text:JSON.stringify(legacy)}],value:'legacy.json'}});
  initDataStore();assert.equal(state.currency,'CNY');assert.deepEqual(state.assets,clean.assets);
`);
test('Money formatting follows the global currency and language without changing precision or data', `
  for(const [code,symbol] of [['USD','$'],['EUR','€'],['JPY','¥']]) {
    commitLedger({...ledgerPayload(),currency:code});const before=durableState();
    for(const lang of ['en','zh-CN']) {
      setLanguage(lang);assert.equal(fmtMoney(1234.56),symbol+' 1,234.56');
      assert.equal(fmtMoney(-10),'- '+symbol+' 10');
      state.isPrivacy=true;assert.equal(fmtMoney(10),symbol+' ••••••');
      assert.equal(fmtMoney(10,true),symbol+' 10');state.isPrivacy=false;
      assert.equal(durableState(),before);updateCurrencyLabels();
      assert.equal(document.getElementById('currencySelect').value,code);
    }
  }
  renderAllocationPie(0,0,0,0,0,[0,0,0,0]);
  assert.equal(document.getElementById('center-donut-val').textContent,'¥0');
  resetFixture();
`);
test('System appearance follows changes; manual choices override the system without altering drafts or ledger data', `
  const before=durableState();document.getElementById('newAssetName').value='Unsaved draft';
  setAppearance('system');changeSystemAppearance(true);assert.equal(document.documentElement.dataset.theme,'dark');
  changeSystemAppearance(false);assert.equal(document.documentElement.dataset.theme,'light');
  setAppearance('dark');changeSystemAppearance(true);changeSystemAppearance(false);
  assert.equal(document.documentElement.dataset.theme,'dark');
  setAppearance('light');changeSystemAppearance(true);assert.equal(document.documentElement.dataset.theme,'light');
  setAppearance('system');assert.equal(document.documentElement.dataset.theme,'dark');
  assert.equal(document.getElementById('appearanceSelect').value,'system');assert.ok(themePaints>0);
  assert.equal(durableState(),before);assert.equal(document.getElementById('newAssetName').value,'Unsaved draft');
  assert.equal('appearance' in createBackup(),false);
`);
test('Appearance preference persists separately and remains usable when storage is unavailable', `
  setAppearance('dark');assert.equal(localStorage.getItem(THEME_KEY),'dark');assert.equal(readAppearance(),'dark');
  const before=durableState();setStorageFailure(true);setAppearance('light');setStorageFailure(false);
  assert.equal(document.documentElement.dataset.theme,'light');assert.equal(localStorage.getItem(THEME_KEY),'dark');
  assert.ok(document.getElementById('preferences-feedback').textContent.includes('本次会话'));
  assert.equal(durableState(),before);setAppearance('INVALID');assert.equal(appearance,'light');
  localStorage.setItem(THEME_KEY,'INVALID');assert.equal(readAppearance(),'system');
  setAppearance('system');
`);
for (const [saved,systemDark,expected] of [[null,false,'light'],[null,true,'dark'],['light',true,'light'],['dark',false,'dark'],['system',true,'dark'],['unknown',false,'light']]) {
  const root={dataset:{}};
  vm.runInNewContext(themeScript,{
    document:{documentElement:root,getElementById:()=>null},
    localStorage:{getItem:()=>saved},
    window:{matchMedia:()=>({matches:systemDark,addEventListener(){}})}
  });
  assert.equal(root.dataset.theme,expected,'Appearance must resolve before the first render');
}
passed++;console.log('PASS Saved appearance and system fallback apply before the first render');
// Check the shipped label inventory, including hidden dialogs and accessible names.
const catalogue = vm.runInContext('EN_MESSAGES',ctx);
for (const match of (html + themeScript).matchAll(/\bt\(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
  const message = vm.runInNewContext(match[1]);
  if (/[\u4e00-\u9fff]/.test(message)) assert.ok(catalogue[message], `Missing English message: ${message}`);
}
const decodeEntities = s => s.replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
for (const match of html.matchAll(/data-(?:i18n(?:-title|-placeholder|-aria-label)?|currency-label)="([^"]+)"/g)) {
  assert.ok(catalogue[decodeEntities(match[1])], `Missing English label: ${match[1]}`);
}
for (const [source,english] of Object.entries(catalogue)) {
  assert.ok(english.trim(), `Empty translation: ${source}`);
  assert.deepEqual([...source.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(),[...english.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(),`Translation parameters: ${source}`);
}
console.log(`\n${passed} scenario groups passed; translation inventory checked.`);
