'use strict';

/* TMS60 optional THIEPN Account + Supabase sync/backup layer. */
(()=>{
  const SUPABASE_URL='https://hycegznamzjhwinegaai.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_1rZzRPzfLMaAH5pIgCwIjA_19UPMIsR';
  const SESSION_STORAGE_KEY='sb-hycegznamzjhwinegaai-auth-token';
  const PKCE_BACKUP_KEY='tms60-pkce-verifier-backup-v1';
  const PKCE_FLOW_KEY='tms60-pkce-flow-v1';
  const PKCE_BACKUP_TTL_MS=15*60*1000;
  const PREF_KEY='tms60-account-sync-prefs-v1';
  const APP_SLUG='tms60';
  const MAX_BACKUPS=7;
  const AUTO_SYNC_DEBOUNCE_MS=4000;
  const AUTO_SYNC_MIN_INTERVAL_MS=15000;
  const MAX_SYNC_ATTEMPTS=4;
  const MAX_CLOUD_STATE_BYTES=32*1024*1024;
  const TRANSLATION_ID=Object.freeze({
    'tms60-esv-memory-lab-v1':'esv',
    'tms60-niv-memory-lab-v1':'niv',
    'tms60-nlt-memory-lab-v1':'nlt',
    'tms60-hfa-memory-lab-v1':'hfa',
    'tms60-sch1951-memory-lab-v1':'schlachter1951',
    'tms60-klb1985-memory-lab-v1':'klb1985',
    'tms60-krv1961-memory-lab-v1':'krv1961'
  })[KEY]||'esv';

  if(!window.supabase?.createClient){
    console.error('TMS60 account sync unavailable: Supabase client did not load.');
    return;
  }

  const topWindow=(()=>{
    try{return window.top&&window.top.location?.origin===location.origin?window.top:window}catch(_){return window}
  })();

  function readPkceBackup(){
    try{
      const raw=sessionStorage.getItem(PKCE_BACKUP_KEY);
      if(!raw)return null;
      const value=JSON.parse(raw);
      const createdAt=Number(value?.createdAt||0);
      if(!value||typeof value!=='object'||Array.isArray(value)||!value.entries||typeof value.entries!=='object'||
        !createdAt||createdAt>Date.now()+60000||Date.now()-createdAt>PKCE_BACKUP_TTL_MS){
        sessionStorage.removeItem(PKCE_BACKUP_KEY);
        return null;
      }
      return value;
    }catch(_){return null}
  }
  function writePkceBackup(value){
    try{sessionStorage.setItem(PKCE_BACKUP_KEY,JSON.stringify(value));return true}catch(_){return false}
  }
  function mirrorPkceEntry(key,value){
    if(!String(key).endsWith('-code-verifier'))return;
    const backup=readPkceBackup()||{createdAt:Date.now(),entries:{}};
    backup.createdAt=Date.now();
    backup.entries[key]=String(value);
    if(!writePkceBackup(backup))throw new Error('Browser tab storage is unavailable. Allow site data, then retry Google sign-in.');
  }
  function clearPkceBackup(){
    try{sessionStorage.removeItem(PKCE_BACKUP_KEY)}catch(_){}
    try{sessionStorage.removeItem(PKCE_FLOW_KEY)}catch(_){}
  }
  const authStorage=Object.freeze({
    getItem(key){
      if(String(key).endsWith('-code-verifier')){
        const mirrored=readPkceBackup()?.entries?.[key];
        if(typeof mirrored==='string')return mirrored;
      }
      try{return localStorage.getItem(key)}
      catch(_){throw new Error('Browser storage is blocked. Allow site data for this site to use THIEPN Account.')}
    },
    setItem(key,value){
      const text=String(value);
      try{
        localStorage.setItem(key,text);
        if(localStorage.getItem(key)!==text)throw new Error('storage_verification_failed');
      }catch(error){
        const e=new Error(error?.name==='QuotaExceededError'
          ?'Browser storage is full. Free some site storage, then retry sign-in.'
          :'Browser storage is blocked or unreliable. Allow site data, then retry sign-in.');
        e.name='TMS60AuthStorageError';
        throw e;
      }
      mirrorPkceEntry(key,text);
    },
    removeItem(key){
      try{localStorage.removeItem(key)}catch(_){}
      // Keep the tab-scoped verifier mirror until callback success/restart.
    }
  });
  function assertAuthStorage(){
    const key=`tms60-auth-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    authStorage.setItem(key,'ok');
    if(authStorage.getItem(key)!=='ok')throw new Error('The browser did not retain sign-in data. Check site-data settings and retry.');
    authStorage.removeItem(key);
  }
  function accountFetch(input,options={}){
    const timeout=typeof AbortSignal?.timeout==='function'?AbortSignal.timeout(15000):null;
    const signal=options.signal&&timeout&&typeof AbortSignal?.any==='function'
      ?AbortSignal.any([options.signal,timeout])
      :(options.signal||timeout||undefined);
    return fetch(input,{...options,signal});
  }
  function pkceMissing(error){
    return /PKCE code verifier not found|AuthPKCECodeVerifierMissingError/i.test(`${error?.name||''} ${error?.message||''}`);
  }
  function accountErrorMessage(error){
    if(error?.name==='TMS60AuthStorageError')return error.message;
    const code=String(error?.code||'');
    const message=String(error?.message||'');
    if(code==='access_denied'||/access denied/i.test(message))return 'Google sign-in was cancelled.';
    if(code==='account_changed')return 'THIEPN Account changed while syncing. The old sync was stopped before its data could be applied; retry on the current account.';
    if(pkceMissing(error))return 'This Google sign-in attempt expired or lost its browser verifier. Start Google sign-in again from TMS60.';
    if(['refresh_token_not_found','refresh_token_already_used','session_not_found','session_expired','bad_jwt'].includes(code))return 'Your THIEPN Account session is no longer valid. Sign in again.';
    if(Number(error?.status)===429)return 'Too many account requests. Wait a moment, then retry.';
    if(/redirect.*not.*allowed|redirect_to/i.test(message))return 'TMS60 is not yet allowed as an OAuth return URL in the shared THIEPN Account project.';
    if(/row-level security|permission denied|42501/i.test(message))return 'TMS60 cloud permissions were rejected. Sign out and back in; if this persists, the account deployment is incomplete.';
    if(Number(error?.status)>=500||['AbortError','TimeoutError','AuthRetryableFetchError','TypeError'].includes(error?.name))return 'The THIEPN Account service could not be reached. Local progress is safe; retry when connected.';
    return message||'The THIEPN Account operation failed.';
  }

  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    auth:{
      flowType:'pkce',
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:false,
      storageKey:SESSION_STORAGE_KEY,
      storage:authStorage
    },
    global:{fetch:accountFetch}
  });

  let session=null;
  let accountStatus='local';
  let accountMessage='Local-only mode';
  let lastRemoteRevision=0;
  let lastRemoteUpdatedAt='';
  let authEpoch=0;
  let syncPromise=null;
  let syncPromiseUserId=null;
  let syncTimer=0;
  let pendingAutoSync=false;
  let restoreBackups=[];
  let accountMismatch=false;

  const safeParse=(raw,fallback)=>{try{return JSON.parse(raw)}catch(_){return fallback}};
  const readPrefs=()=>{
    try{
      const raw=safeParse(localStorage.getItem(PREF_KEY),{});
      return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    }catch(_){return{}}
  };
  const prefs=readPrefs();
  if(typeof prefs.autoSync!=='boolean')prefs.autoSync=true;
  if(!prefs.lastSyncByTranslation||typeof prefs.lastSyncByTranslation!=='object'||Array.isArray(prefs.lastSyncByTranslation))prefs.lastSyncByTranslation={};
  if(Number.isFinite(Number(prefs.lastSyncAt))&&Number(prefs.lastSyncAt)>0&&!prefs.lastSyncByTranslation[TRANSLATION_ID])prefs.lastSyncByTranslation[TRANSLATION_ID]=Number(prefs.lastSyncAt);
  delete prefs.lastSyncAt;
  if(!prefs.boundUserByTranslation||typeof prefs.boundUserByTranslation!=='object'||Array.isArray(prefs.boundUserByTranslation))prefs.boundUserByTranslation={};
  if(!prefs.deviceId){
    prefs.deviceId=(crypto.randomUUID?.()||`device-${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0,120);
  }
  const writePrefs=()=>{try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}catch(_){}};
  writePrefs();

  const isOnline=()=>navigator.onLine!==false;
  const signedIn=()=>Boolean(session?.user?.id);
  function applySession(nextSession){
    const previousId=session?.user?.id||null;
    const nextId=nextSession?.user?.id||null;
    if(previousId!==nextId){
      authEpoch++;
      restoreBackups=[];
      accountMismatch=false;
      lastRemoteRevision=0;
      lastRemoteUpdatedAt='';
    }
    session=nextSession||null;
    return session;
  }
  const getLastSyncAt=()=>Math.max(0,Number(prefs.lastSyncByTranslation?.[TRANSLATION_ID])||0);
  const setLastSyncAt=value=>{prefs.lastSyncByTranslation[TRANSLATION_ID]=Math.max(0,Number(value)||0);writePrefs()};
  const getBoundUser=()=>String(prefs.boundUserByTranslation?.[TRANSLATION_ID]||'');
  const setBoundUser=value=>{if(value)prefs.boundUserByTranslation[TRANSLATION_ID]=String(value);else delete prefs.boundUserByTranslation[TRANSLATION_ID];writePrefs()};
  function ensureAccountBinding(){
    if(!signedIn()){accountMismatch=false;return false}
    const current=String(session.user.id),bound=getBoundUser();
    if(!bound){setBoundUser(current);accountMismatch=false;return true}
    accountMismatch=bound!==current;
    return !accountMismatch;
  }
  const fmtAccountTime=value=>{
    if(!value)return 'Never';
    const n=typeof value==='number'?value:Date.parse(value);
    if(!Number.isFinite(n)||n<=0)return 'Unknown';
    try{return new Date(n).toLocaleString()}catch(_){return 'Unknown'}
  };
  const userLabel=()=>{
    const meta=session?.user?.user_metadata||{};
    return String(meta.full_name||meta.name||session?.user?.email||'THIEPN Account').slice(0,160);
  };
  const userAvatar=()=>{
    const meta=session?.user?.user_metadata||{};
    return String(meta.avatar_url||meta.picture||'').slice(0,1200);
  };

  function setAccountStatus(status,message){
    accountStatus=status;
    accountMessage=message||status;
    refreshAccountPanel();
  }

  function injectStyles(){
    if(document.getElementById('tms60-account-style'))return;
    const style=document.createElement('style');
    style.id='tms60-account-style';
    style.textContent=`
      .account-card{position:relative;overflow:hidden}.account-card::before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:var(--accent)}
      .account-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.account-head h2{margin:0}
      .account-status{display:inline-flex;align-items:center;gap:7px;padding:5px 9px;border-radius:999px;border:1px solid var(--border);font-size:.75rem;font-weight:750;background:var(--surface2);white-space:nowrap}
      .account-status::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--muted)}
      .account-status.synced::before{background:var(--success)}.account-status.syncing::before{background:var(--warn)}.account-status.error::before{background:var(--danger)}.account-status.offline::before{background:var(--warn)}
      .account-identity{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;padding:11px 12px;border:1px solid var(--border);border-radius:14px;background:var(--surface2);margin:11px 0}
      .account-avatar{width:38px;height:38px;border-radius:50%;object-fit:cover;background:var(--surface3);border:1px solid var(--border)}
      .account-avatar-fallback{display:grid;place-items:center;font-weight:850;color:var(--accent)}
      .account-identity-text{min-width:0}.account-identity-text strong,.account-identity-text span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .account-meta{display:grid;gap:5px;margin:10px 0;color:var(--muted);font-size:.78rem}.account-meta strong{color:var(--text)}
      .account-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.account-actions .btn{min-height:38px}
      .account-note{margin-top:10px;font-size:.75rem;color:var(--muted);line-height:1.45}
      .account-switch{margin-top:12px}
      @media(max-width:560px){.account-head{display:grid}.account-actions{display:grid;grid-template-columns:1fr 1fr}.account-actions .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function accountIdentityMarkup(){
    if(!signedIn())return '';
    const avatar=userAvatar();
    const avatarMarkup=avatar
      ?`<img class="account-avatar" src="${htmlEsc(avatar)}" alt="" referrerpolicy="no-referrer">`
      :'<div class="account-avatar account-avatar-fallback" aria-hidden="true">T</div>';
    const email=String(session.user.email||'').slice(0,254);
    return `<div class="account-identity">${avatarMarkup}<div class="account-identity-text"><strong>${htmlEsc(userLabel())}</strong>${email?`<span class="tiny muted">${htmlEsc(email)}</span>`:''}</div></div>`;
  }

  function accountPanelHtml(){
    const statusClass=['synced','syncing','error','offline'].includes(accountStatus)?accountStatus:'';
    const label=accountStatus==='syncing'?'Syncing…':accountStatus==='synced'?'Synced':accountStatus==='offline'?'Offline':accountStatus==='error'?'Sync issue':signedIn()?'Connected':'Local only';
    return `<article class="card flat account-card" id="tms60-account-card">
      <div class="account-head">
        <div><h2>THIEPN Account &amp; sync</h2><p class="muted small-text">Optional account sync through the same THIEPN Account used by other apps. TMS60 remains fully usable offline without signing in. Cloud progress is isolated per Bible translation.</p></div>
        <span class="account-status ${statusClass}">${htmlEsc(label)}</span>
      </div>
      ${accountIdentityMarkup()}
      <div class="account-meta">
        <div><strong>Status:</strong> ${htmlEsc(accountMessage)}</div>
        <div><strong>Bible version:</strong> ${htmlEsc(TRANSLATION_ID)}</div>
        <div><strong>Last sync:</strong> ${htmlEsc(fmtAccountTime(getLastSyncAt()))}</div>
        ${lastRemoteRevision?`<div><strong>Cloud revision:</strong> ${lastRemoteRevision}${lastRemoteUpdatedAt?` · ${htmlEsc(fmtAccountTime(lastRemoteUpdatedAt))}`:''}</div>`:''}
      </div>
      <div class="account-actions">
        ${signedIn()
          ? accountMismatch
            ? `<button class="btn primary" data-account-action="confirm-switch-account">Use this account for ${htmlEsc(TRANSLATION_ID)}</button>
               <button class="btn" data-account-action="sign-out">Sign out</button>`
            : `<button class="btn primary" data-account-action="sync-now" ${!isOnline()?'disabled':''}>Sync now</button>
               <button class="btn" data-account-action="create-backup" ${!isOnline()?'disabled':''}>Cloud backup</button>
               <button class="btn" data-account-action="restore-backup" ${!isOnline()?'disabled':''}>Restore backup</button>
               <button class="btn" data-account-action="sign-out">Sign out</button>
               <button class="btn danger" data-account-action="confirm-delete-cloud" ${!isOnline()?'disabled':''}>Delete cloud data</button>`
          : `<button class="btn primary" data-account-action="google-sign-in" ${!isOnline()?'disabled':''}>Continue with Google</button>`}
      </div>
      <label class="switch-row account-switch"><span><strong>Automatic sync</strong><br><span class="tiny muted">After local progress is saved, synchronize the active Bible version when signed in and online.</span></span><input type="checkbox" id="tms60-auto-sync" ${prefs.autoSync?'checked':''} ${accountMismatch?'disabled':''}></label>
      <p class="account-note">${accountMismatch
        ?'This Bible version has local progress linked to a different THIEPN Account. Cloud access is blocked to prevent cross-account data mixing. Use the explicit switch action if you intend to move this local version to the current account.'
        :'Progress is always written locally first. TMS60 cloud rows are private to your account through Supabase Row Level Security. Signing out clears the shared THIEPN Account session on this browser origin but does not delete local progress.'}</p>
    </article>`;
  }

  function injectAccountPanel(){
    injectStyles();
    const settings=document.getElementById('view-settings');
    if(!settings)return;
    settings.querySelector('#tms60-account-card')?.remove();
    const stacks=settings.querySelectorAll('.settings-grid>.stack');
    const target=stacks[1]||stacks[0];
    if(target)target.insertAdjacentHTML('afterbegin',accountPanelHtml());
  }
  function refreshAccountPanel(){
    if(document.getElementById('view-settings')?.classList.contains('active'))injectAccountPanel();
  }

  function assertCloudStateSize(json){
    const bytes=new TextEncoder().encode(json).byteLength;
    if(bytes>MAX_CLOUD_STATE_BYTES)throw new Error('TMS60 progress is too large for cloud sync. Export a local JSON backup and trim old review history before retrying.');
    return bytes;
  }

  async function sha256(value){
    try{
      if(!crypto.subtle)return null;
      const data=new TextEncoder().encode(value);
      const digest=await crypto.subtle.digest('SHA-256',data);
      return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
    }catch(_){return null}
  }

  async function currentSession(){
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    return applySession(data.session||null);
  }

  async function markAppUsed(userId=session?.user?.id){
    if(!userId)return;
    const row={user_id:userId,app_slug:APP_SLUG,last_used_at:new Date().toISOString(),source:'app'};
    const {error}=await client.from('account_user_apps').upsert(row,{onConflict:'user_id,app_slug'});
    if(error)console.warn('TMS60 app usage registration failed:',error.message);
  }

  function validateRemoteState(row){
    if(!row)return null;
    if(Number(row.state_schema)>SCHEMA)throw new Error('Cloud progress was created by a newer TMS60 version. Update TMS60 before syncing.');
    if(!row.state||typeof row.state!=='object'||Array.isArray(row.state)||!completeStateShape(row.state))throw new Error('Cloud progress has an invalid structure.');
    return sanitizeState(row.state);
  }

  async function pullRemote(userId){
    if(!userId)throw new Error('Sign in before syncing.');
    const {data,error}=await client.from('tms60_sync_state')
      .select('user_id,translation_id,revision,state_schema,state,state_hash,client_updated_at,device_id,updated_at')
      .eq('user_id',userId)
      .eq('translation_id',TRANSLATION_ID)
      .maybeSingle();
    if(error)throw error;
    if(data){
      validateRemoteState(data);
      lastRemoteRevision=Number(data.revision)||0;
      lastRemoteUpdatedAt=data.updated_at||'';
    }else{
      lastRemoteRevision=0;
      lastRemoteUpdatedAt='';
    }
    return data||null;
  }

  async function insertRemote(sourceState,userId){
    const clean=sanitizeState(sourceState);
    const json=JSON.stringify(clean);
    const payload={
      user_id:userId,
      translation_id:TRANSLATION_ID,
      revision:1,
      state_schema:SCHEMA,
      state:clean,
      state_hash:await sha256(json),
      client_updated_at:Math.max(0,Math.floor(Number(clean.meta?.updatedAt)||Date.now())),
      device_id:prefs.deviceId,
      updated_at:new Date().toISOString()
    };
    assertCloudStateSize(json);
    const {data,error}=await client.from('tms60_sync_state').insert(payload).select('revision,updated_at').single();
    if(error)throw error;
    lastRemoteRevision=Number(data.revision)||1;
    lastRemoteUpdatedAt=data.updated_at||'';
    return lastRemoteRevision;
  }

  async function updateRemoteCas(expectedRevision,sourceState,userId){
    const clean=sanitizeState(sourceState);
    const json=JSON.stringify(clean);
    const payload={
      revision:expectedRevision+1,
      state_schema:SCHEMA,
      state:clean,
      state_hash:await sha256(json),
      client_updated_at:Math.max(0,Math.floor(Number(clean.meta?.updatedAt)||Date.now())),
      device_id:prefs.deviceId,
      updated_at:new Date().toISOString()
    };
    assertCloudStateSize(json);
    const {data,error}=await client.from('tms60_sync_state')
      .update(payload)
      .eq('user_id',userId)
      .eq('translation_id',TRANSLATION_ID)
      .eq('revision',expectedRevision)
      .select('revision,updated_at')
      .maybeSingle();
    if(error)throw error;
    if(!data)return null;
    lastRemoteRevision=Number(data.revision)||expectedRevision+1;
    lastRemoteUpdatedAt=data.updated_at||'';
    return lastRemoteRevision;
  }

  const coreSave=save;

  function persistMergedLocal(merged){
    const before=sanitizeState(state);
    const beforeJson=JSON.stringify(before);
    const mergedClean=sanitizeState(merged);
    if(beforeJson===JSON.stringify(mergedClean))return false;
    createRecoverySnapshot();
    state=mergedClean;
    const ok=coreSave();
    if(!ok){
      state=before;
      renderAll();
      throw new Error('Cloud changes were not applied because browser storage is unavailable.');
    }
    renderAll();
    return true;
  }

  async function runSyncAttempt(userId,isCurrent){
    const localBefore=sanitizeState(state);
    const remote=await pullRemote(userId);
    if(!isCurrent())throw Object.assign(new Error('THIEPN Account changed while sync was running.'),{code:'account_changed'});
    if(!remote){
      try{
        const revision=await insertRemote(localBefore,userId);
        if(!isCurrent())throw Object.assign(new Error('THIEPN Account changed while sync was running.'),{code:'account_changed'});
        return {revision,changedLocal:false,created:true};
      }catch(error){
        if(String(error?.code||'')==='23505'||Number(error?.status)===409)return null;
        throw error;
      }
    }

    const remoteState=validateRemoteState(remote);
    if(!isCurrent())throw Object.assign(new Error('THIEPN Account changed while sync was running.'),{code:'account_changed'});
    const merged=mergeStates(localBefore,remoteState);
    const changedLocal=JSON.stringify(merged)!==JSON.stringify(localBefore);
    if(changedLocal)persistMergedLocal(merged);

    const localNow=sanitizeState(state);
    if(JSON.stringify(localNow)===JSON.stringify(remoteState)){
      return {revision:Number(remote.revision)||1,changedLocal,created:false};
    }

    const revision=await updateRemoteCas(Number(remote.revision)||1,localNow,userId);
    if(!isCurrent())throw Object.assign(new Error('THIEPN Account changed while sync was running.'),{code:'account_changed'});
    if(revision==null)return null;
    return {revision,changedLocal,created:false};
  }

  async function performSync({manual=false}={}){
    const requestedUserId=session?.user?.id||null;
    if(syncPromise){
      if(syncPromiseUserId===requestedUserId)return syncPromise;
      try{await syncPromise}catch(_){}
      if((session?.user?.id||null)!==requestedUserId)return null;
    }
    if(!signedIn()){
      if(manual)throw new Error('Sign in to your THIEPN Account before syncing.');
      return null;
    }
    if(accountMismatch||!ensureAccountBinding()){
      const message='This Bible version is linked to a different THIEPN Account. Use the explicit account-switch action before syncing.';
      setAccountStatus('error',message);
      if(manual)throw new Error(message);
      return null;
    }
    if(!isOnline()){
      pendingAutoSync=true;
      setAccountStatus('offline','Offline — local progress is safe and will sync later');
      if(manual)throw new Error('You are offline. Local progress is safe and will sync when you reconnect.');
      return null;
    }
    if(hasActiveSession()){
      pendingAutoSync=true;
      if(manual)throw new Error('End the active recall session before merging cloud progress.');
      return null;
    }

    syncPromiseUserId=requestedUserId;
    syncPromise=(async()=>{
      setAccountStatus('syncing','Comparing local and cloud progress…');
      await currentSession();
      if(!signedIn())throw new Error('Your THIEPN Account session expired. Sign in again.');
      if(session.user.id!==requestedUserId)throw Object.assign(new Error('THIEPN Account changed while sync was starting.'),{code:'account_changed'});
      const epoch=authEpoch;
      const userId=requestedUserId;
      const isCurrent=()=>authEpoch===epoch&&session?.user?.id===userId;
      await markAppUsed(userId);
      if(!isCurrent())throw Object.assign(new Error('THIEPN Account changed while sync was running.'),{code:'account_changed'});

      let result=null;
      for(let attempt=1;attempt<=MAX_SYNC_ATTEMPTS;attempt++){
        result=await runSyncAttempt(userId,isCurrent);
        if(result)break;
      }
      if(!result)throw new Error('Another device kept changing cloud progress. No data was lost; retry sync.');
      if(!isCurrent())throw Object.assign(new Error('THIEPN Account changed while sync was running.'),{code:'account_changed'});

      setLastSyncAt(Date.now());
      pendingAutoSync=false;
      setAccountStatus('synced',result.changedLocal?'Synced — cloud progress merged safely':'Up to date');
      return result;
    })().catch(error=>{
      const message=accountErrorMessage(error);
      if(error?.code!=='account_changed')setAccountStatus(isOnline()?'error':'offline',message);
      throw Object.assign(error instanceof Error?error:new Error(message),{message});
    }).finally(()=>{
      syncPromise=null;
      syncPromiseUserId=null;
    });
    return syncPromise;
  }

  function queueAutoSync(){
    if(!prefs.autoSync||!signedIn()||accountMismatch)return;
    pendingAutoSync=true;
    clearTimeout(syncTimer);
    const elapsed=Date.now()-getLastSyncAt();
    const delay=Math.max(AUTO_SYNC_DEBOUNCE_MS,AUTO_SYNC_MIN_INTERVAL_MS-elapsed);
    syncTimer=setTimeout(()=>{performSync().catch(()=>{})},delay);
  }

  save=function(){
    const ok=coreSave();
    if(ok)queueAutoSync();
    return ok;
  };

  async function createCloudBackup(){
    if(hasActiveSession())throw new Error('End the active recall session before creating a cloud backup.');
    setAccountStatus('syncing','Synchronizing before backup…');
    const syncResult=await performSync({manual:true});
    const clean=sanitizeState(state);
    assertCloudStateSize(JSON.stringify(clean));
    const {error}=await client.from('tms60_backups').insert({
      user_id:session.user.id,
      translation_id:TRANSLATION_ID,
      state_schema:SCHEMA,
      state:clean,
      source_revision:Number(syncResult?.revision||lastRemoteRevision||0),
      device_id:prefs.deviceId
    });
    if(error)throw error;

    const {data:list,error:listError}=await client.from('tms60_backups')
      .select('id,created_at')
      .eq('user_id',session.user.id)
      .eq('translation_id',TRANSLATION_ID)
      .order('created_at',{ascending:false})
      .limit(100);
    if(listError)throw listError;
    const stale=(list||[]).slice(MAX_BACKUPS).map(x=>x.id);
    if(stale.length){
      const {error:deleteError}=await client.from('tms60_backups').delete().in('id',stale);
      if(deleteError)console.warn('TMS60 old backup cleanup failed:',deleteError.message);
    }
    setAccountStatus('synced','Cloud backup created');
    toast('Cloud backup created.');
  }

  async function openRestoreBackups(){
    if(hasActiveSession())throw new Error('End the active recall session before restoring cloud data.');
    setAccountStatus('syncing','Loading cloud backups…');
    const {data,error}=await client.from('tms60_backups')
      .select('id,created_at,source_revision,state_schema,translation_id')
      .eq('user_id',session.user.id)
      .eq('translation_id',TRANSLATION_ID)
      .order('created_at',{ascending:false})
      .limit(MAX_BACKUPS);
    if(error)throw error;
    restoreBackups=data||[];
    setAccountStatus('synced',restoreBackups.length?'Cloud backups ready':'No cloud backups yet');
    if(!restoreBackups.length){toast('No cloud backups are available yet.','error');return}
    modal(`<div class="modal-head"><h2>Restore cloud backup</h2><button class="btn icon-btn" data-action="close-modal" aria-label="Close dialog">×</button></div>
      <p class="muted">Restoring replaces the current TMS60 progress state. A fresh cloud backup and local recovery snapshot are created first.</p>
      <div class="side-list">${restoreBackups.map((item,index)=>`<button class="btn" data-account-action="restore-backup-file" data-backup-index="${index}">${htmlEsc(fmtAccountTime(item.created_at))} · rev ${Number(item.source_revision)||0}</button>`).join('')}</div>
      <div class="modal-actions"><button class="btn" data-action="close-modal">Cancel</button></div>`);
  }

  async function restoreBackup(index){
    if(hasActiveSession())throw new Error('End the active recall session before restoring cloud data.');
    const item=restoreBackups[Number(index)];
    if(!item)throw new Error('That cloud backup is no longer available.');

    const {data,error}=await client.from('tms60_backups')
      .select('id,translation_id,state_schema,state,created_at')
      .eq('user_id',session.user.id)
      .eq('translation_id',TRANSLATION_ID)
      .eq('id',item.id)
      .single();
    if(error)throw error;
    if(Number(data.state_schema)>SCHEMA||!completeStateShape(data.state))throw new Error('That backup is incompatible with this TMS60 version.');
    const selectedState=sanitizeState(data.state);

    // Fetch the selected backup before creating the safety backup: retention
    // cleanup may otherwise delete the oldest selected backup.
    await createCloudBackup();

    createRecoverySnapshot();
    state=selectedState;
    setNewEpoch();
    state.meta.settingsChangedAt=state.meta.stateEpoch;
    if(!coreSave())throw new Error('The restored backup could not be stored locally.');
    renderAll();
    closeModal(false);

    const remote=await pullRemote();
    if(remote){
      const pushed=await updateRemoteCas(Number(remote.revision)||1,state);
      if(pushed==null)await performSync({manual:true});
    }else{
      await insertRemote(state);
    }
    setLastSyncAt(Date.now());
    setAccountStatus('synced','Cloud backup restored and synchronized');
    toast('Cloud backup restored.');
  }

  async function deleteCloudData(){
    if(hasActiveSession())throw new Error('End the active recall session before deleting cloud data.');
    const {error:backupError}=await client.from('tms60_backups').delete().eq('user_id',session.user.id);
    if(backupError)throw backupError;
    const {error:stateError}=await client.from('tms60_sync_state').delete().eq('user_id',session.user.id);
    if(stateError)throw stateError;
    lastRemoteRevision=0;lastRemoteUpdatedAt='';
    prefs.lastSyncByTranslation={};
    prefs.autoSync=false;
    pendingAutoSync=false;
    clearTimeout(syncTimer);syncTimer=0;
    writePrefs();
    setAccountStatus('synced','TMS60 cloud data deleted — automatic sync paused; local progress remains on this device');
    toast('TMS60 cloud data deleted. Local progress was kept and automatic sync was turned off.');
  }

  async function signInGoogle(){
    if(!isOnline())throw new Error('Connect to the internet before signing in.');
    assertAuthStorage();
    clearPkceBackup();
    const redirect=new URL(topWindow.location.href);
    redirect.hash='';
    redirect.search='';
    redirect.searchParams.set('tms60_auth','1');
    const {data,error}=await client.auth.signInWithOAuth({
      provider:'google',
      options:{
        redirectTo:redirect.toString(),
        skipBrowserRedirect:true,
        queryParams:{prompt:'select_account'}
      }
    });
    if(error)throw error;
    if(data?.flowId){try{sessionStorage.setItem(PKCE_FLOW_KEY,data.flowId)}catch(_){}}
    const target=new URL(data?.url||'');
    const supabaseOrigin=new URL(SUPABASE_URL).origin;
    if(target.origin!==supabaseOrigin||target.pathname!=='/auth/v1/authorize')throw new Error('Google sign-in returned an invalid authorization destination.');
    topWindow.location.assign(target.href);
  }

  async function signOut(){
    clearTimeout(syncTimer);syncTimer=0;pendingAutoSync=false;
    const {error}=await client.auth.signOut({scope:'local'});
    if(error)throw error;
    applySession(null);
    accountMismatch=false;
    lastRemoteRevision=0;lastRemoteUpdatedAt='';
    setAccountStatus('local','Signed out — local progress remains on this device');
  }

  async function processAuthCallback(){
    let url;
    try{url=new URL(topWindow.location.href)}catch(_){return false}
    if(url.searchParams.get('tms60_auth')!=='1')return false;

    const authError=url.searchParams.get('error_description')||url.searchParams.get('error');
    const code=url.searchParams.get('code');
    const callbackFlowId=url.searchParams.get('sb_flow_id');
    const storedFlowId=(()=>{try{return sessionStorage.getItem(PKCE_FLOW_KEY)}catch(_){return null}})();
    const flowId=callbackFlowId||storedFlowId||null;
    if(authError){
      cleanupCallbackUrl(url);
      clearPkceBackup();
      const error=new Error(authError);
      error.code=url.searchParams.get('error')||url.searchParams.get('error_code')||'oauth_error';
      throw error;
    }
    if(!code)return false;

    let result=await client.auth.exchangeCodeForSession(code,flowId?{flowId}:undefined);
    if(result.error&&flowId&&pkceMissing(result.error)){
      result=await client.auth.exchangeCodeForSession(code);
    }
    if(result.error)throw result.error;
    cleanupCallbackUrl(url);
    clearPkceBackup();
    applySession(result.data?.session||null);
    return Boolean(session);
  }

  function cleanupCallbackUrl(url){
    for(const key of ['code','sb_flow_id','error','error_code','error_description','tms60_auth'])url.searchParams.delete(key);
    const clean=`${url.pathname}${url.search}${url.hash}`;
    try{topWindow.history.replaceState({},topWindow.document?.title||document.title,clean)}catch(_){}
  }

  async function activateSession(nextSession,{sync=true}={}){
    applySession(nextSession||null);
    if(!signedIn()){
      accountMismatch=false;
      setAccountStatus('local','Local-only mode');
      return;
    }
    if(!ensureAccountBinding()){
      setAccountStatus('error','Different THIEPN Account detected. Cloud access is blocked for this Bible version until you explicitly switch its local binding.');
      await markAppUsed();
      return;
    }
    setAccountStatus(isOnline()?'syncing':'offline',isOnline()?'THIEPN Account connected':'Signed in · offline');
    await markAppUsed();
    if(sync&&prefs.autoSync&&isOnline()&&!hasActiveSession())await performSync().catch(()=>{});
    else if(sync&&prefs.autoSync)pendingAutoSync=true;
  }

  async function bootstrapAuth(){
    try{
      const callbackHandled=await processAuthCallback();
      const {data,error}=await client.auth.getSession();
      if(error)throw error;
      await activateSession(data.session||null,{sync:true});
      if(callbackHandled)toast('Signed in to THIEPN Account.');
    }catch(error){
      const message=accountErrorMessage(error);
      setAccountStatus('error',message);
      toast(message,'error');
    }
  }

  client.auth.onAuthStateChange((event,nextSession)=>{
    if(event==='INITIAL_SESSION')return;
    applySession(nextSession||null);
    if(event==='SIGNED_OUT'){
      accountMismatch=false;
      lastRemoteRevision=0;lastRemoteUpdatedAt='';
      setAccountStatus('local','Signed out — local progress remains on this device');
      return;
    }
    if(nextSession&&['SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event)){
      refreshAccountPanel();
      if(event==='SIGNED_IN')setTimeout(()=>activateSession(nextSession,{sync:true}).catch(()=>{}),0);
    }
  });

  const coreRenderSettings=renderSettings;
  renderSettings=function(){
    coreRenderSettings();
    injectAccountPanel();
  };

  async function handleAccountAction(button){
    const action=button.dataset.accountAction;
    try{
      button.disabled=true;
      if(action==='google-sign-in')await signInGoogle();
      else if(action==='sync-now'){await performSync({manual:true});toast('TMS60 sync complete.')}
      else if(action==='create-backup')await createCloudBackup();
      else if(action==='restore-backup')await openRestoreBackups();
      else if(action==='restore-backup-file')await restoreBackup(button.dataset.backupIndex);
      else if(action==='sign-out')await signOut();
      else if(action==='confirm-switch-account'){
        modal(`<div class="modal-head"><h2>Switch this Bible version to the current account?</h2><button class="btn icon-btn" data-action="close-modal" aria-label="Close dialog">×</button></div>
          <p>TMS60 will export the current <strong>${htmlEsc(TRANSLATION_ID)}</strong> local progress first, create a recovery snapshot, then clear this local version before loading the current THIEPN Account's cloud state. This prevents two accounts from being merged.</p>
          <div class="modal-actions"><button class="btn" data-action="close-modal">Cancel</button><button class="btn danger" data-account-action="switch-account">Export &amp; switch</button></div>`);
      }else if(action==='switch-account'){
        if(hasActiveSession())throw new Error('End the active recall session before switching accounts.');
        exportJSON();
        createRecoverySnapshot();
        storageWriteBlocked=false;storageBlockMessage='';
        state=defaultState(0);
        if(!coreSave())throw new Error('The new account state could not be stored locally.');
        setBoundUser(session.user.id);
        accountMismatch=false;
        setLastSyncAt(0);
        lastRemoteRevision=0;lastRemoteUpdatedAt='';
        closeModal(false);
        renderAll();
        await performSync({manual:true});
        toast('This Bible version is now linked to the current THIEPN Account.');
      }
      else if(action==='confirm-delete-cloud'){
        modal(`<div class="modal-head"><h2>Delete TMS60 cloud data?</h2><button class="btn icon-btn" data-action="close-modal" aria-label="Close dialog">×</button></div>
          <p>This removes <strong>all TMS60 Bible-version sync data and cloud backups</strong> from your THIEPN Account. Local progress on this device is kept, and automatic sync is turned off so the deleted cloud data is not recreated on reload.</p>
          <div class="modal-actions"><button class="btn" data-action="close-modal">Cancel</button><button class="btn danger" data-account-action="delete-cloud">Delete cloud data</button></div>`);
      }else if(action==='delete-cloud'){await deleteCloudData();closeModal(false)}
    }catch(error){
      const message=accountErrorMessage(error);
      setAccountStatus(isOnline()?'error':'offline',message);
      toast(message,'error');
    }finally{
      button.disabled=false;
      refreshAccountPanel();
    }
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-account-action]');
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    handleAccountAction(button);
  },true);

  document.addEventListener('change',event=>{
    if(event.target.id!=='tms60-auto-sync')return;
    prefs.autoSync=Boolean(event.target.checked);
    writePrefs();
    if(prefs.autoSync&&!accountMismatch)queueAutoSync();
    refreshAccountPanel();
  });

  addEventListener('online',()=>{
    if(signedIn()){
      setAccountStatus('syncing','Back online — preparing sync');
      if(pendingAutoSync||prefs.autoSync)queueAutoSync();
    }else refreshAccountPanel();
  });
  addEventListener('offline',()=>setAccountStatus(signedIn()?'offline':'local',signedIn()?'Offline — local progress continues safely':'Local-only mode'));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&signedIn()&&pendingAutoSync)queueAutoSync()});

  injectAccountPanel();
  bootstrapAuth();

  window.TMS60Account=Object.freeze({
    client,
    sync:()=>performSync({manual:true}),
    backup:createCloudBackup,
    signInGoogle,
    signOut,
    signedIn:()=>signedIn()
  });
})();
