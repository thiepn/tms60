'use strict';

/* TMS60 optional THIEPN Account + Supabase sync/backup layer. */
(()=>{
  const SUPABASE_URL='https://hycegznamzjhwinegaai.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_1rZzRPzfLMaAH5pIgCwIjA_19UPMIsR';
  const SESSION_STORAGE_KEY='sb-hycegznamzjhwinegaai-auth-token';
  const PREF_KEY='tms60-account-sync-prefs-v1';
  const APP_SLUG='tms60';
  const MAX_BACKUPS=7;
  const AUTO_SYNC_DEBOUNCE_MS=4000;
  const AUTO_SYNC_MIN_INTERVAL_MS=15000;
  const MAX_SYNC_ATTEMPTS=4;

  if(!window.supabase?.createClient){
    console.error('TMS60 account sync unavailable: Supabase client did not load.');
    return;
  }

  const topWindow=(()=>{
    try{return window.top&&window.top.location?.origin===location.origin?window.top:window}catch(_){return window}
  })();

  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    auth:{
      flowType:'pkce',
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:false,
      storageKey:SESSION_STORAGE_KEY
    }
  });

  let session=null;
  let accountStatus='local';
  let accountMessage='Local-only mode';
  let lastRemoteRevision=0;
  let lastRemoteUpdatedAt='';
  let syncPromise=null;
  let syncTimer=0;
  let pendingAutoSync=false;
  let restoreBackups=[];

  const safeParse=(raw,fallback)=>{try{return JSON.parse(raw)}catch(_){return fallback}};
  const readPrefs=()=>{
    try{
      const raw=safeParse(localStorage.getItem(PREF_KEY),{});
      return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    }catch(_){return{}}
  };
  const prefs=readPrefs();
  if(typeof prefs.autoSync!=='boolean')prefs.autoSync=true;
  if(!Number.isFinite(Number(prefs.lastSyncAt)))prefs.lastSyncAt=0;
  if(!prefs.deviceId){
    prefs.deviceId=(crypto.randomUUID?.()||`device-${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0,120);
  }
  const writePrefs=()=>{try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}catch(_){}};
  writePrefs();

  const isOnline=()=>navigator.onLine!==false;
  const signedIn=()=>Boolean(session?.user?.id);
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
        <div><h2>THIEPN Account &amp; sync</h2><p class="muted small-text">Optional account sync through the same THIEPN Account used by other apps. TMS60 remains fully usable offline without signing in.</p></div>
        <span class="account-status ${statusClass}">${htmlEsc(label)}</span>
      </div>
      ${accountIdentityMarkup()}
      <div class="account-meta">
        <div><strong>Status:</strong> ${htmlEsc(accountMessage)}</div>
        <div><strong>Last sync:</strong> ${htmlEsc(fmtAccountTime(Number(prefs.lastSyncAt)||0))}</div>
        ${lastRemoteRevision?`<div><strong>Cloud revision:</strong> ${lastRemoteRevision}${lastRemoteUpdatedAt?` · ${htmlEsc(fmtAccountTime(lastRemoteUpdatedAt))}`:''}</div>`:''}
      </div>
      <div class="account-actions">
        ${signedIn()
          ? `<button class="btn primary" data-account-action="sync-now" ${!isOnline()?'disabled':''}>Sync now</button>
             <button class="btn" data-account-action="create-backup" ${!isOnline()?'disabled':''}>Cloud backup</button>
             <button class="btn" data-account-action="restore-backup" ${!isOnline()?'disabled':''}>Restore backup</button>
             <button class="btn" data-account-action="sign-out">Sign out</button>
             <button class="btn danger" data-account-action="confirm-delete-cloud" ${!isOnline()?'disabled':''}>Delete cloud data</button>`
          : `<button class="btn primary" data-account-action="google-sign-in" ${!isOnline()?'disabled':''}>Continue with Google</button>`}
      </div>
      <label class="switch-row account-switch"><span><strong>Automatic sync</strong><br><span class="tiny muted">After local progress is saved, synchronize it when signed in and online.</span></span><input type="checkbox" id="tms60-auto-sync" ${prefs.autoSync?'checked':''}></label>
      <p class="account-note">Progress is always written locally first. TMS60 cloud rows are private to your account through Supabase Row Level Security. Signing out clears the shared THIEPN Account session on this browser origin but does not delete local progress.</p>
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
    session=data.session||null;
    return session;
  }

  async function markAppUsed(){
    if(!signedIn())return;
    const row={user_id:session.user.id,app_slug:APP_SLUG,last_used_at:new Date().toISOString(),source:'app'};
    const {error}=await client.from('account_user_apps').upsert(row,{onConflict:'user_id,app_slug'});
    if(error)console.warn('TMS60 app usage registration failed:',error.message);
  }

  function validateRemoteState(row){
    if(!row)return null;
    if(Number(row.state_schema)>SCHEMA)throw new Error('Cloud progress was created by a newer TMS60 version. Update TMS60 before syncing.');
    if(!row.state||typeof row.state!=='object'||Array.isArray(row.state)||!completeStateShape(row.state))throw new Error('Cloud progress has an invalid structure.');
    return sanitizeState(row.state);
  }

  async function pullRemote(){
    if(!signedIn())throw new Error('Sign in before syncing.');
    const {data,error}=await client.from('tms60_sync_state')
      .select('user_id,revision,state_schema,state,state_hash,client_updated_at,device_id,updated_at')
      .eq('user_id',session.user.id)
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

  async function insertRemote(sourceState){
    const clean=sanitizeState(sourceState);
    const json=JSON.stringify(clean);
    const payload={
      user_id:session.user.id,
      revision:1,
      state_schema:SCHEMA,
      state:clean,
      state_hash:await sha256(json),
      client_updated_at:Math.max(0,Math.floor(Number(clean.meta?.updatedAt)||Date.now())),
      device_id:prefs.deviceId,
      updated_at:new Date().toISOString()
    };
    const {data,error}=await client.from('tms60_sync_state').insert(payload).select('revision,updated_at').single();
    if(error)throw error;
    lastRemoteRevision=Number(data.revision)||1;
    lastRemoteUpdatedAt=data.updated_at||'';
    return lastRemoteRevision;
  }

  async function updateRemoteCas(expectedRevision,sourceState){
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
    const {data,error}=await client.from('tms60_sync_state')
      .update(payload)
      .eq('user_id',session.user.id)
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

  async function runSyncAttempt(){
    const localBefore=sanitizeState(state);
    const remote=await pullRemote();
    if(!remote){
      try{
        const revision=await insertRemote(localBefore);
        return {revision,changedLocal:false,created:true};
      }catch(error){
        if(String(error?.code||'')==='23505'||Number(error?.status)===409)return null;
        throw error;
      }
    }

    const remoteState=validateRemoteState(remote);
    const merged=mergeStates(localBefore,remoteState);
    const changedLocal=JSON.stringify(merged)!==JSON.stringify(localBefore);
    if(changedLocal)persistMergedLocal(merged);

    const localNow=sanitizeState(state);
    if(JSON.stringify(localNow)===JSON.stringify(remoteState)){
      return {revision:Number(remote.revision)||1,changedLocal,created:false};
    }

    const revision=await updateRemoteCas(Number(remote.revision)||1,localNow);
    if(revision==null)return null;
    return {revision,changedLocal,created:false};
  }

  async function performSync({manual=false}={}){
    if(syncPromise)return syncPromise;
    if(!signedIn()){
      if(manual)throw new Error('Sign in to your THIEPN Account before syncing.');
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

    syncPromise=(async()=>{
      setAccountStatus('syncing','Comparing local and cloud progress…');
      await currentSession();
      if(!signedIn())throw new Error('Your THIEPN Account session expired. Sign in again.');
      await markAppUsed();

      let result=null;
      for(let attempt=1;attempt<=MAX_SYNC_ATTEMPTS;attempt++){
        result=await runSyncAttempt();
        if(result)break;
      }
      if(!result)throw new Error('Another device kept changing cloud progress. No data was lost; retry sync.');

      prefs.lastSyncAt=Date.now();
      pendingAutoSync=false;
      writePrefs();
      setAccountStatus('synced',result.changedLocal?'Synced — cloud progress merged safely':'Up to date');
      return result;
    })().catch(error=>{
      setAccountStatus(isOnline()?'error':'offline',String(error?.message||error));
      throw error;
    }).finally(()=>{syncPromise=null});
    return syncPromise;
  }

  function queueAutoSync(){
    if(!prefs.autoSync||!signedIn())return;
    pendingAutoSync=true;
    clearTimeout(syncTimer);
    const elapsed=Date.now()-(Number(prefs.lastSyncAt)||0);
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
    const {error}=await client.from('tms60_backups').insert({
      user_id:session.user.id,
      state_schema:SCHEMA,
      state:clean,
      source_revision:Number(syncResult?.revision||lastRemoteRevision||0),
      device_id:prefs.deviceId
    });
    if(error)throw error;

    const {data:list,error:listError}=await client.from('tms60_backups')
      .select('id,created_at')
      .eq('user_id',session.user.id)
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
      .select('id,created_at,source_revision,state_schema')
      .eq('user_id',session.user.id)
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
    await createCloudBackup();

    const {data,error}=await client.from('tms60_backups')
      .select('id,state_schema,state,created_at')
      .eq('user_id',session.user.id)
      .eq('id',item.id)
      .single();
    if(error)throw error;
    if(Number(data.state_schema)>SCHEMA||!completeStateShape(data.state))throw new Error('That backup is incompatible with this TMS60 version.');

    createRecoverySnapshot();
    state=sanitizeState(data.state);
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
    prefs.lastSyncAt=Date.now();
    writePrefs();
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
    prefs.lastSyncAt=0;writePrefs();
    setAccountStatus('synced','TMS60 cloud data deleted — local progress remains on this device');
    toast('TMS60 cloud data deleted. Local progress was kept.');
  }

  async function signInGoogle(){
    if(!isOnline())throw new Error('Connect to the internet before signing in.');
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
    const target=new URL(data?.url||'');
    const supabaseOrigin=new URL(SUPABASE_URL).origin;
    if(target.origin!==supabaseOrigin||target.pathname!=='/auth/v1/authorize')throw new Error('Google sign-in returned an invalid authorization destination.');
    topWindow.location.assign(target.href);
  }

  async function signOut(){
    clearTimeout(syncTimer);syncTimer=0;pendingAutoSync=false;
    const {error}=await client.auth.signOut({scope:'local'});
    if(error)throw error;
    session=null;
    lastRemoteRevision=0;lastRemoteUpdatedAt='';
    setAccountStatus('local','Signed out — local progress remains on this device');
  }

  async function processAuthCallback(){
    let url;
    try{url=new URL(topWindow.location.href)}catch(_){return false}
    if(url.searchParams.get('tms60_auth')!=='1')return false;

    const authError=url.searchParams.get('error_description')||url.searchParams.get('error');
    const code=url.searchParams.get('code');
    if(authError){
      cleanupCallbackUrl(url);
      throw new Error(authError);
    }
    if(!code)return false;

    const {data,error}=await client.auth.exchangeCodeForSession(code);
    cleanupCallbackUrl(url);
    if(error)throw error;
    session=data.session||null;
    return Boolean(session);
  }

  function cleanupCallbackUrl(url){
    for(const key of ['code','error','error_code','error_description','tms60_auth'])url.searchParams.delete(key);
    const clean=`${url.pathname}${url.search}${url.hash}`;
    try{topWindow.history.replaceState({},topWindow.document?.title||document.title,clean)}catch(_){}
  }

  async function activateSession(nextSession,{sync=true}={}){
    session=nextSession||null;
    if(!signedIn()){
      setAccountStatus('local','Local-only mode');
      return;
    }
    setAccountStatus(isOnline()?'syncing':'offline',isOnline()?'THIEPN Account connected':'Signed in · offline');
    await markAppUsed();
    if(sync&&isOnline()&&!hasActiveSession())await performSync().catch(()=>{});
    else if(sync)pendingAutoSync=true;
  }

  async function bootstrapAuth(){
    try{
      const callbackHandled=await processAuthCallback();
      const {data,error}=await client.auth.getSession();
      if(error)throw error;
      await activateSession(data.session||null,{sync:true});
      if(callbackHandled)toast('Signed in to THIEPN Account.');
    }catch(error){
      setAccountStatus('error',String(error?.message||error));
      toast(String(error?.message||error),'error');
    }
  }

  client.auth.onAuthStateChange((event,nextSession)=>{
    if(event==='INITIAL_SESSION')return;
    session=nextSession||null;
    if(event==='SIGNED_OUT'){
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
      else if(action==='confirm-delete-cloud'){
        modal(`<div class="modal-head"><h2>Delete TMS60 cloud data?</h2><button class="btn icon-btn" data-action="close-modal" aria-label="Close dialog">×</button></div>
          <p>This removes TMS60 sync data and cloud backups from your THIEPN Account. <strong>Local progress on this device is kept.</strong></p>
          <div class="modal-actions"><button class="btn" data-action="close-modal">Cancel</button><button class="btn danger" data-account-action="delete-cloud">Delete cloud data</button></div>`);
      }else if(action==='delete-cloud'){await deleteCloudData();closeModal(false)}
    }catch(error){
      const message=String(error?.message||error||'Account action failed.');
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
    if(prefs.autoSync)queueAutoSync();
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
