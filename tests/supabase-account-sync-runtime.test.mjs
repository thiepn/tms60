import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../account-sync.js',import.meta.url),'utf8');
const wait=(ms=15)=>new Promise(resolve=>setTimeout(resolve,ms));
const clone=value=>JSON.parse(JSON.stringify(value));

function storage(initial={},options={}){
  const map=new Map(Object.entries(initial));
  const failSetKeys=new Set(options.failSetKeys||[]);
  return {
    getItem:key=>map.has(String(key))?map.get(String(key)):null,
    setItem(key,value){
      if(failSetKeys.has(String(key)))throw Object.assign(new Error('quota'),{name:'QuotaExceededError'});
      map.set(String(key),String(value));
    },
    removeItem:key=>map.delete(String(key)),
    failSet:key=>failSetKeys.add(String(key)),
    allowSet:key=>failSetKeys.delete(String(key)),
    dump:()=>Object.fromEntries(map)
  };
}

function makeState(marker='local',epoch=1){
  return {
    version:6,
    progress:{1:{stage:1,attempts:1}},
    events:[],
    activity:{},
    assessments:[],
    settings:{},
    meta:{createdAt:1,updatedAt:10,settingsChangedAt:10,saveCounter:1,lastSnapshot:0,stateEpoch:epoch},
    marker
  };
}

function keyOf(userId,translationId){return `${userId}|${translationId}`}

function createFakeSupabase({db,sessionRef,clientOptionsRef,exchangeCalls,oauthStarts,oauthOptions,rpcCalls}){
  function rowsFor(table){
    if(table==='tms60_sync_state')return [...db.sync.values()];
    if(table==='tms60_backups')return db.backups;
    return [];
  }

  function query(table){
    let op='select';
    let payload=null;
    const filters=[];
    let orderSpec=null;
    let limitValue=null;

    const matches=row=>filters.every(([kind,column,value])=>{
      if(kind==='eq')return row?.[column]===value;
      if(kind==='in')return value.includes(row?.[column]);
      return true;
    });

    const q={
      select(){return q},
      eq(column,value){filters.push(['eq',column,value]);return q},
      in(column,value){filters.push(['in',column,value]);if(op==='delete')return executeDelete();return q},
      order(column,{ascending=true}={}){orderSpec={column,ascending};return q},
      limit(value){limitValue=value;return q},
      insert(value){op='insert';payload=value;return q},
      update(value){op='update';payload=value;return q},
      delete(){op='delete';return q},
      async upsert(value){
        db.apps.push(clone(value));
        return {data:null,error:null};
      },
      async maybeSingle(){
        if(op==='select'){
          const rows=executeSelect();
          return {data:rows[0]??null,error:rows.length>1?{message:'multiple rows'}:null};
        }
        if(op==='update'){
          const rows=rowsFor(table).filter(matches);
          if(table==='tms60_sync_state'&&rows.length){
            const old=rows[0];
            const next={...old,...clone(payload)};
            db.sync.set(keyOf(next.user_id,next.translation_id),next);
            return {data:{revision:next.revision,updated_at:next.updated_at},error:null};
          }
          return {data:null,error:null};
        }
        return {data:null,error:null};
      },
      async single(){
        if(op==='insert'){
          if(table==='tms60_sync_state'){
            const row=clone(payload);
            const key=keyOf(row.user_id,row.translation_id);
            if(db.sync.has(key))return {data:null,error:{code:'23505',status:409,message:'duplicate'}};
            db.sync.set(key,row);
            return {data:{revision:row.revision,updated_at:row.updated_at},error:null};
          }
          if(table==='tms60_backups'){
            const rows=Array.isArray(payload)?payload:[payload];
            for(const item of rows)db.backups.push({...clone(item),id:item.id||`b${db.backups.length+1}`,created_at:item.created_at||new Date().toISOString()});
            return {data:clone(rows[0]),error:null};
          }
        }
        const rows=executeSelect();
        return rows.length===1?{data:rows[0],error:null}:{data:null,error:{message:'row not found'}};
      },
      then(resolve,reject){
        const result=op==='delete'
          ?executeDelete()
          :op==='insert'
            ?executeInsert()
            :{data:executeSelect(),error:null};
        return Promise.resolve(result).then(resolve,reject);
      }
    };

    function executeInsert(){
      if(table==='tms60_sync_state'){
        const row=clone(payload);
        const key=keyOf(row.user_id,row.translation_id);
        if(db.sync.has(key))return {data:null,error:{code:'23505',status:409,message:'duplicate'}};
        db.sync.set(key,row);
        return {data:clone(row),error:null};
      }
      if(table==='tms60_backups'){
        const rows=Array.isArray(payload)?payload:[payload];
        const inserted=[];
        for(const item of rows){
          const row={...clone(item),id:item.id||`b${db.backups.length+1}`,created_at:item.created_at||new Date().toISOString()};
          db.backups.push(row);
          inserted.push(row);
        }
        return {data:clone(inserted),error:null};
      }
      return {data:null,error:null};
    }

    function executeSelect(){
      let rows=rowsFor(table).filter(matches).map(clone);
      if(orderSpec)rows.sort((a,b)=>{
        const av=a[orderSpec.column],bv=b[orderSpec.column];
        const cmp=av===bv?0:av>bv?1:-1;
        return orderSpec.ascending?cmp:-cmp;
      });
      if(Number.isFinite(limitValue))rows=rows.slice(0,limitValue);
      return rows;
    }
    function executeDelete(){
      if(table==='tms60_backups'){
        const before=db.backups.length;
        db.backups=db.backups.filter(row=>!matches(row));
        return Promise.resolve({data:null,error:null,count:before-db.backups.length});
      }
      if(table==='tms60_sync_state'){
        for(const [key,row] of [...db.sync])if(matches(row))db.sync.delete(key);
        return Promise.resolve({data:null,error:null});
      }
      return Promise.resolve({data:null,error:null});
    }
    return q;
  }

  return {
    createClient(_url,_key,options){
      clientOptionsRef.value=options;
      return {
        auth:{
          async getSession(){return {data:{session:sessionRef.value},error:null}},
          async signInWithOAuth(request){
            oauthOptions.push(request);
            const flowId='flow-start';
            options.auth.storage.setItem(`sb-hycegznamzjhwinegaai-auth-token-flow-${flowId}-code-verifier`,'verifier/start');
            options.auth.storage.setItem('sb-hycegznamzjhwinegaai-auth-token-code-verifier','verifier/start');
            oauthStarts.push(flowId);
            return {data:{flowId,url:`https://hycegznamzjhwinegaai.supabase.co/auth/v1/authorize?provider=google&sb_flow_id=${flowId}`},error:null};
          },
          async exchangeCodeForSession(code,optionsArg){
            exchangeCalls.push({code,options:optionsArg??null});
            if(code==='bad')return {data:{session:null},error:{name:'AuthPKCECodeVerifierMissingError',message:'PKCE code verifier not found'}};
            sessionRef.value={user:{id:'user-a',email:'a@example.test'},access_token:'a',refresh_token:'r',expires_at:9999999999};
            return {data:{session:sessionRef.value},error:null};
          },
          async signOut(){sessionRef.value=null;return {error:null}},
          onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}
        },
        from:query,
        async rpc(name,args){
          rpcCalls.push({name,args:clone(args||{})});
          if(name!=='delete_tms60_cloud_data')return {data:null,error:{message:'unknown rpc'}};
          const current=sessionRef.value?.user?.id||null;
          if(!current||args?.p_expected_user_id!==current)return {data:null,error:{status:403,code:'42501',message:'account changed before deletion'}};
          let states=0;
          for(const [key,row] of [...db.sync])if(row.user_id===current){db.sync.delete(key);states++}
          const before=db.backups.length;
          db.backups=db.backups.filter(row=>row.user_id!==current);
          return {data:{deleted_sync_states:states,deleted_backups:before-db.backups.length},error:null};
        }
      };
    }
  };
}

function createRuntime({
  key='tms60-esv-memory-lab-v1',
  href='https://thiepn.dev/tms60/',
  initialLocal={},
  initialSession={},
  failLocalSetKeys=[],
  session=null,
  db={sync:new Map(),backups:[],apps:[]}
}={}){
  const localStorage=storage(initialLocal,{failSetKeys:failLocalSetKeys});
  const sessionStorage=storage(initialSession);
  const listeners=new Map();
  const exchangeCalls=[];
  const oauthStarts=[];
  const oauthOptions=[];
  const rpcCalls=[];
  const sessionRef={value:session};
  const clientOptionsRef={value:null};
  const assigned=[];
  const replaced=[];

  const topLocation={
    href,
    origin:'https://thiepn.dev',
    assign(url){assigned.push(String(url));this.href=String(url)}
  };
  const topWindow={
    location:topLocation,
    document:{title:'TMS60'},
    history:{replaceState(_state,_title,url){
      replaced.push(String(url));
      topLocation.href=new URL(String(url),'https://thiepn.dev').href;
    }}
  };

  const document={
    head:{appendChild(){}},
    hidden:false,
    createElement(){return {id:'',textContent:'',style:{}}},
    getElementById(){return null},
    addEventListener(type,callback){
      if(!listeners.has(type))listeners.set(type,[]);
      listeners.get(type).push(callback);
    }
  };

  const context={
    console,
    URL,
    TextEncoder,
    Uint8Array,
    AbortSignal,
    Date,
    Math,
    JSON,
    Promise,
    Object,
    Array,
    Number,
    String,
    Boolean,
    RegExp,
    Error,
    Set,
    Map,
    setTimeout,
    clearTimeout,
    navigator:{onLine:true},
    location:{origin:'https://thiepn.dev'},
    localStorage,
    sessionStorage,
    document,
    addEventListener(){},
    crypto:{
      randomUUID:()=> 'device-test',
      subtle:{digest:async()=>new Uint8Array(32).buffer}
    },
    SCHEMA:6,
    KEY:key,
    state:makeState('local'),
    storageWriteBlocked:false,
    storageBlockMessage:'',
    htmlEsc:value=>String(value??''),
    sanitizeState:value=>clone(value),
    completeStateShape:value=>Boolean(value&&value.progress),
    mergeStates:(local,_remote)=>clone(local),
    save:()=>true,
    renderSettings:()=>{},
    renderAll:()=>{},
    createRecoverySnapshot:()=>Date.now(),
    setNewEpoch:()=>{context.state.meta.stateEpoch=(context.state.meta.stateEpoch||0)+1},
    hasActiveSession:()=>false,
    defaultState:epoch=>makeState('blank',epoch),
    exportJSON:()=>{context.exportCount=(context.exportCount||0)+1},
    closeModal:()=>{},
    modal:()=>{},
    toast:()=>{},
    exportCount:0
  };
  context.window=context;
  context.top=topWindow;
  context.supabase=createFakeSupabase({db,sessionRef,clientOptionsRef,exchangeCalls,oauthStarts,oauthOptions,rpcCalls});

  vm.createContext(context);
  vm.runInContext(source,context,{filename:'account-sync.js'});

  async function dispatchClick(action,dataset={}){
    const button={dataset:{accountAction:action,...dataset},disabled:false};
    const event={
      target:{closest:selector=>selector==='[data-account-action]'?button:null},
      preventDefault(){},
      stopPropagation(){}
    };
    for(const callback of listeners.get('click')||[])callback(event);
    await wait(30);
    return button;
  }

  async function dispatchResetAll(){
    const button={dataset:{action:'reset-all'},disabled:false};
    const flags={prevented:false,immediateStopped:false};
    const event={
      target:{closest:selector=>selector==='[data-action="reset-all"]'?button:null},
      preventDefault(){flags.prevented=true},
      stopPropagation(){},
      stopImmediatePropagation(){flags.immediateStopped=true}
    };
    for(const callback of listeners.get('click')||[])callback(event);
    await wait(10);
    return {button,...flags};
  }

  return {context,db,localStorage,sessionStorage,sessionRef,clientOptionsRef,exchangeCalls,oauthStarts,oauthOptions,rpcCalls,assigned,replaced,dispatchClick,dispatchResetAll};
}

test('PKCE callback uses explicit flow id across the srcdoc iframe boundary',async()=>{
  const prefs=JSON.stringify({autoSync:false,deviceId:'device-test',lastSyncByTranslation:{},boundUserByTranslation:{}});
  const runtime=createRuntime({
    href:'https://thiepn.dev/tms60/?tms60_auth=1&code=good&sb_flow_id=flow-callback',
    initialLocal:{'tms60-account-sync-prefs-v1':prefs}
  });
  await wait(30);

  assert.equal(runtime.exchangeCalls.length,1);
  assert.equal(runtime.exchangeCalls[0].code,'good');
  assert.equal(runtime.exchangeCalls[0].options?.flowId,'flow-callback');
  assert.equal(runtime.replaced.length,1);
  assert.ok(!runtime.replaced[0].includes('code='));
  assert.ok(!runtime.replaced[0].includes('sb_flow_id='));
  assert.ok(!runtime.replaced[0].includes('tms60_auth='));
});

test('explicit first-time OAuth login links local progress and auto-syncs',async()=>{
  const db={sync:new Map(),backups:[],apps:[]};
  const prefs=JSON.stringify({autoSync:true,deviceId:'device-test',lastSyncByTranslation:{},boundUserByTranslation:{}});
  const runtime=createRuntime({
    href:'https://thiepn.dev/tms60/?tms60_auth=1&code=good&sb_flow_id=flow-callback',
    initialLocal:{'tms60-account-sync-prefs-v1':prefs},
    db
  });
  await wait(80);

  assert.ok(db.sync.has('user-a|esv'),'explicit first login should immediately create/sync the cloud state');
  const saved=JSON.parse(runtime.localStorage.getItem('tms60-account-sync-prefs-v1'));
  assert.equal(saved.boundUserByTranslation.esv,'user-a','first login should persist the translation/account binding');
  assert.ok(Number(saved.lastSyncByTranslation.esv)>0,'first login should record a successful sync timestamp');
});

test('Google sign-in preserves PKCE verifier recovery state before navigation',async()=>{
  const prefs=JSON.stringify({autoSync:false,deviceId:'device-test',lastSyncByTranslation:{},boundUserByTranslation:{}});
  const runtime=createRuntime({initialLocal:{'tms60-account-sync-prefs-v1':prefs}});
  await wait();

  await runtime.context.TMS60Account.signInGoogle();
  assert.equal(runtime.oauthStarts[0],'flow-start');
  assert.equal(runtime.sessionStorage.getItem('tms60-pkce-flow-v1'),'flow-start');
  const backup=JSON.parse(runtime.sessionStorage.getItem('tms60-pkce-verifier-backup-v1'));
  assert.ok(Object.keys(backup.entries).some(key=>key.endsWith('-code-verifier')));
  assert.match(runtime.assigned[0],/^https:\/\/hycegznamzjhwinegaai\.supabase\.co\/auth\/v1\/authorize/);
});


test('dedicated TMS60 origin uses its own direct PKCE callback',async()=>{
  const prefs=JSON.stringify({autoSync:false,deviceId:'device-test',lastSyncByTranslation:{},boundUserByTranslation:{}});
  const runtime=createRuntime({
    href:'https://tms60.thiepn.dev/',
    initialLocal:{'tms60-account-sync-prefs-v1':prefs}
  });
  await wait();

  await runtime.context.TMS60Account.signInGoogle();
  assert.equal(runtime.oauthOptions[0]?.provider,'google');
  assert.equal(runtime.oauthOptions[0]?.options?.redirectTo,'https://tms60.thiepn.dev/?tms60_auth=1');
  assert.equal(runtime.sessionStorage.getItem('tms60-pkce-flow-v1'),'flow-start');
  const backup=JSON.parse(runtime.sessionStorage.getItem('tms60-pkce-verifier-backup-v1'));
  assert.ok(Object.keys(backup.entries).some(key=>key.endsWith('-code-verifier')));
});

test('same account stores independent ESV and NIV cloud states',async()=>{
  const db={sync:new Map(),backups:[],apps:[]};
  const shared=storage();
  const session={user:{id:'user-a',email:'a@example.test'},access_token:'a',refresh_token:'r',expires_at:9999999999};
  const prefs=JSON.stringify({autoSync:false,deviceId:'device-test',lastSyncByTranslation:{},boundUserByTranslation:{esv:'user-a',niv:'user-a'}});

  const esv=createRuntime({key:'tms60-esv-memory-lab-v1',initialLocal:{'tms60-account-sync-prefs-v1':prefs},session,db});
  await wait();
  await esv.context.TMS60Account.sync();
  const persistedPrefs=esv.localStorage.getItem('tms60-account-sync-prefs-v1');

  const niv=createRuntime({key:'tms60-niv-memory-lab-v1',initialLocal:{'tms60-account-sync-prefs-v1':persistedPrefs},session,db});
  await wait();
  await niv.context.TMS60Account.sync();

  assert.ok(db.sync.has('user-a|esv'));
  assert.ok(db.sync.has('user-a|niv'));
  assert.equal(db.sync.size,2);
});

test('local translation binding blocks silent sync into a different shared account',async()=>{
  const db={sync:new Map(),backups:[],apps:[]};
  const session={user:{id:'user-b',email:'b@example.test'},access_token:'b',refresh_token:'r2',expires_at:9999999999};
  const prefs=JSON.stringify({
    autoSync:true,
    deviceId:'device-test',
    lastSyncByTranslation:{},
    boundUserByTranslation:{esv:'user-a'}
  });
  const runtime=createRuntime({initialLocal:{'tms60-account-sync-prefs-v1':prefs},session,db});
  await wait(30);

  await assert.rejects(()=>runtime.context.TMS60Account.sync(),/different THIEPN Account/i);
  assert.equal(db.sync.has('user-b|esv'),false);
});

test('delete cloud data is identity-bound and remains deleted after reload',async()=>{
  const state=makeState('remote');
  const db={
    sync:new Map([
      ['user-a|esv',{user_id:'user-a',translation_id:'esv',revision:1,state_schema:6,state:clone(state),updated_at:'2026-09-28T20:00:00Z'}],
      ['user-a|niv',{user_id:'user-a',translation_id:'niv',revision:1,state_schema:6,state:clone(state),updated_at:'2026-09-28T20:00:00Z'}]
    ]),
    backups:[{id:'b1',user_id:'user-a',translation_id:'esv',state_schema:6,state:clone(state),created_at:'2026-09-28T20:00:00Z'}],
    apps:[]
  };
  const session={user:{id:'user-a',email:'a@example.test'},access_token:'a',refresh_token:'r',expires_at:9999999999};
  const prefs=JSON.stringify({
    autoSync:true,
    deviceId:'device-test',
    lastSyncByTranslation:{esv:1},
    boundUserByTranslation:{esv:'user-a'}
  });
  const runtime=createRuntime({initialLocal:{'tms60-account-sync-prefs-v1':prefs},session,db});
  await wait(40);
  await runtime.dispatchClick('delete-cloud');

  assert.equal(db.sync.size,0);
  assert.equal(db.backups.length,0);
  const afterDelete=JSON.parse(runtime.localStorage.getItem('tms60-account-sync-prefs-v1'));
  assert.equal(afterDelete.autoSync,false);

  const reload=createRuntime({
    initialLocal:{'tms60-account-sync-prefs-v1':JSON.stringify(afterDelete)},
    session,
    db
  });
  await wait(40);
  assert.equal(db.sync.size,0,'reload must not silently recreate deleted cloud state');
  assert.equal(reload.context.TMS60Account.signedIn(),true);
});


test('full local reset pauses sync before the shell can reload cloud data',async()=>{
  const db={sync:new Map(),backups:[],apps:[]};
  const session={user:{id:'user-a',email:'a@example.test'},access_token:'a',refresh_token:'r',expires_at:9999999999};
  const prefs=JSON.stringify({
    autoSync:true,
    deviceId:'device-test',
    lastSyncByTranslation:{},
    boundUserByTranslation:{esv:'user-a'}
  });
  const runtime=createRuntime({initialLocal:{'tms60-account-sync-prefs-v1':prefs},session,db});
  await wait(35);
  await runtime.dispatchResetAll();

  const saved=JSON.parse(runtime.localStorage.getItem('tms60-account-sync-prefs-v1'));
  assert.equal(saved.autoSync,false);
});


test('mismatched OAuth flow id is rejected before code exchange',async()=>{
  const prefs=JSON.stringify({autoSync:false,deviceId:'device-test',lastSyncByTranslation:{},boundUserByTranslation:{}});
  const runtime=createRuntime({
    href:'https://thiepn.dev/tms60/?tms60_auth=1&code=good&sb_flow_id=flow-callback',
    initialLocal:{'tms60-account-sync-prefs-v1':prefs},
    initialSession:{'tms60-pkce-flow-v1':'different-flow'}
  });
  await wait(30);
  assert.equal(runtime.exchangeCalls.length,0);
  assert.equal(runtime.replaced.length,1);
});

test('unknown future translation keys derive an isolated cloud id instead of falling back to ESV',async()=>{
  const db={sync:new Map(),backups:[],apps:[]};
  const session={user:{id:'user-a',email:'a@example.test'},access_token:'a',refresh_token:'r',expires_at:9999999999};
  const prefs=JSON.stringify({autoSync:false,deviceId:'device-test',lastSyncByTranslation:{},boundUserByTranslation:{futurex:'user-a'}});
  const runtime=createRuntime({
    key:'tms60-futurex-memory-lab-v1',
    initialLocal:{'tms60-account-sync-prefs-v1':prefs},
    session,
    db
  });
  await wait();
  await runtime.context.TMS60Account.sync();
  assert.ok(db.sync.has('user-a|futurex'));
  assert.equal(db.sync.has('user-a|esv'),false);
});


test('restoring the oldest retained backup still works after safety-backup pruning',async()=>{
  const session={user:{id:'user-a',email:'a@example.test'},access_token:'a',refresh_token:'r',expires_at:9999999999};
  const current=makeState('current');
  const backups=Array.from({length:7},(_,index)=>({
    id:`b${index+1}`,
    user_id:'user-a',
    translation_id:'esv',
    state_schema:6,
    state:makeState(index===0?'oldest':`backup-${index+1}`),
    source_revision:index+1,
    created_at:new Date(Date.UTC(2026,8,28,20,0,index)).toISOString()
  }));
  const db={
    sync:new Map([['user-a|esv',{user_id:'user-a',translation_id:'esv',revision:4,state_schema:6,state:clone(current),updated_at:'2026-09-28T20:00:00Z'}]]),
    backups,
    apps:[]
  };
  const prefs=JSON.stringify({
    autoSync:false,
    deviceId:'device-test',
    lastSyncByTranslation:{esv:1},
    boundUserByTranslation:{esv:'user-a'}
  });
  const runtime=createRuntime({initialLocal:{'tms60-account-sync-prefs-v1':prefs},session,db});
  await wait(30);

  await runtime.dispatchClick('restore-backup');
  await wait(30);
  await runtime.dispatchClick('restore-backup-file',{backupIndex:'6'});
  await wait(80);

  assert.equal(runtime.context.state.marker,'oldest');
  assert.equal(db.sync.get('user-a|esv')?.state?.marker,'oldest');
  assert.ok(db.backups.length<=7);
});


test('existing unbound local progress never auto-uploads to an already shared THIEPN session',async()=>{
  const db={sync:new Map(),backups:[],apps:[]};
  const session={user:{id:'user-a',email:'a@example.test'},access_token:'a',refresh_token:'r',expires_at:9999999999};
  const prefs=JSON.stringify({autoSync:true,deviceId:'device-test',lastSyncByTranslation:{},boundUserByTranslation:{}});
  const runtime=createRuntime({initialLocal:{'tms60-account-sync-prefs-v1':prefs},session,db});
  await wait(50);

  assert.equal(db.sync.size,0,'existing local progress must wait for explicit account linking');
  await assert.rejects(()=>runtime.context.TMS60Account.sync(),/Existing local progress has not been linked/i);

  await runtime.dispatchClick('link-account');
  await wait(60);
  assert.ok(db.sync.has('user-a|esv'),'explicit link may then sync local progress');
});

test('cloud deletion is blocked before RPC if sync-off safety preferences cannot persist',async()=>{
  const state=makeState('remote');
  const db={
    sync:new Map([['user-a|esv',{user_id:'user-a',translation_id:'esv',revision:1,state_schema:6,state:clone(state),updated_at:'2026-09-28T20:00:00Z'}]]),
    backups:[{id:'b1',user_id:'user-a',translation_id:'esv',state_schema:6,state:clone(state),created_at:'2026-09-28T20:00:00Z'}],
    apps:[]
  };
  const session={user:{id:'user-a',email:'a@example.test'},access_token:'a',refresh_token:'r',expires_at:9999999999};
  const prefKey='tms60-account-sync-prefs-v1';
  const prefs=JSON.stringify({autoSync:true,deviceId:'device-test',lastSyncByTranslation:{},boundUserByTranslation:{esv:'user-a'}});
  const runtime=createRuntime({
    initialLocal:{[prefKey]:prefs},
    failLocalSetKeys:[prefKey],
    session,
    db
  });
  await wait(30);
  await runtime.dispatchClick('delete-cloud');
  await wait(30);

  assert.equal(runtime.rpcCalls.length,0,'destructive RPC must not run without durable no-resurrection guard');
  assert.equal(db.sync.size,1);
  assert.equal(db.backups.length,1);
});

test('full local reset is cancelled if the cloud-sync pause cannot be persisted',async()=>{
  const db={sync:new Map(),backups:[],apps:[]};
  const session={user:{id:'user-a',email:'a@example.test'},access_token:'a',refresh_token:'r',expires_at:9999999999};
  const prefKey='tms60-account-sync-prefs-v1';
  const prefs=JSON.stringify({autoSync:true,deviceId:'device-test',lastSyncByTranslation:{},boundUserByTranslation:{esv:'user-a'}});
  const runtime=createRuntime({
    initialLocal:{[prefKey]:prefs},
    failLocalSetKeys:[prefKey],
    session,
    db
  });
  await wait(30);
  const result=await runtime.dispatchResetAll();

  assert.equal(result.prevented,true);
  assert.equal(result.immediateStopped,true);
});


test('explicit account switch adopts the new account state without uploading old local progress',async()=>{
  const remoteState=makeState('account-b');
  const db={
    sync:new Map([['user-b|esv',{
      user_id:'user-b',
      translation_id:'esv',
      revision:3,
      state_schema:6,
      state:clone(remoteState),
      updated_at:'2026-09-28T20:00:00Z'
    }]]),
    backups:[],
    apps:[]
  };
  const session={user:{id:'user-b',email:'b@example.test'},access_token:'b',refresh_token:'r2',expires_at:9999999999};
  const prefs=JSON.stringify({
    autoSync:true,
    deviceId:'device-test',
    lastSyncByTranslation:{esv:1},
    boundUserByTranslation:{esv:'user-a'}
  });
  const runtime=createRuntime({initialLocal:{'tms60-account-sync-prefs-v1':prefs},session,db});
  runtime.context.state=makeState('account-a-local');
  await wait(30);

  await runtime.dispatchClick('switch-account');
  await wait(80);

  const savedPrefs=JSON.parse(runtime.localStorage.getItem('tms60-account-sync-prefs-v1'));
  assert.equal(runtime.context.exportCount,1);
  assert.equal(runtime.context.state.marker,'account-b');
  assert.equal(savedPrefs.boundUserByTranslation.esv,'user-b');
  assert.equal(savedPrefs.rebindRequired,false);
  assert.equal(db.sync.get('user-b|esv')?.state?.marker,'account-b');
});
