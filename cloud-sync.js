'use strict';

/* TMS60 optional Google account / Drive App Data sync layer. */
(()=>{
  const CONFIG=window.TMS60_CLOUD_CONFIG||{};
  const CLIENT_ID=String(CONFIG.googleClientId||'').trim();
  const SYNC_FILE=String(CONFIG.syncFileName||'tms60-sync-v1.json');
  const BACKUP_PREFIX=String(CONFIG.backupPrefix||'tms60-backup-v1-');
  const MAX_BACKUPS=Math.max(1,Math.min(20,Number(CONFIG.maxCloudBackups)||7));
  const AUTO_DEBOUNCE=Math.max(1000,Number(CONFIG.autoSyncDebounceMs)||4000);
  const AUTO_MIN_INTERVAL=Math.max(5000,Number(CONFIG.autoSyncMinIntervalMs)||15000);
  const PREF_KEY='tms60-cloud-prefs-v1';
  const CLOUD_FORMAT='tms60-cloud-sync';
  const CLOUD_VERSION=1;
  const SCOPE='openid email profile https://www.googleapis.com/auth/drive.appdata';
  const DRIVE='https://www.googleapis.com/drive/v3';
  const UPLOAD='https://www.googleapis.com/upload/drive/v3';
  const USERINFO='https://openidconnect.googleapis.com/v1/userinfo';

  let tokenClient=null;
  let tokenErrorCallback=null;
  let token=null;
  let tokenExpiresAt=0;
  let profile=null;
  let gisPromise=null;
  let syncPromise=null;
  let syncTimer=0;
  let pendingAutoSync=false;
  let cloudStatus='disconnected';
  let cloudMessage='Not connected';
  let lastRemoteModified='';
  let restoreFiles=[];

  const safeJsonParse=(raw,fallback)=>{try{return JSON.parse(raw)}catch(_){return fallback}};
  const readPrefs=()=>{
    try{
      const raw=safeJsonParse(localStorage.getItem(PREF_KEY),{});
      return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    }catch(_){return{}}
  };
  let prefs=readPrefs();
  if(typeof prefs.autoSync!=='boolean')prefs.autoSync=true;
  if(typeof prefs.wasConnected!=='boolean')prefs.wasConnected=false;
  if(!Number.isFinite(Number(prefs.lastSyncAt)))prefs.lastSyncAt=0;
  if(!prefs.deviceId){
    prefs.deviceId=(crypto.randomUUID?.()||`device-${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0,80);
  }
  const writePrefs=()=>{try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}catch(_){}};
  writePrefs();

  const configured=()=>Boolean(CLIENT_ID&&/\.apps\.googleusercontent\.com$/i.test(CLIENT_ID));
  const online=()=>navigator.onLine!==false;
  const connected=()=>Boolean(token&&Date.now()<tokenExpiresAt-15000);
  const fmtCloudTime=value=>{
    const n=Number(value)||Date.parse(value||'');
    if(!n)return 'Never';
    try{return new Date(n).toLocaleString()}catch(_){return 'Unknown'}
  };
  const setCloudStatus=(status,message)=>{
    cloudStatus=status;
    cloudMessage=message||status;
    refreshCloudPanel();
  };

  function injectStyles(){
    if(document.getElementById('tms60-cloud-style'))return;
    const style=document.createElement('style');
    style.id='tms60-cloud-style';
    style.textContent=`
      .cloud-card{position:relative;overflow:hidden}.cloud-card::before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:var(--accent)}
      .cloud-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.cloud-head h2{margin:0}
      .cloud-status{display:inline-flex;align-items:center;gap:7px;padding:5px 9px;border-radius:999px;border:1px solid var(--border);font-size:.75rem;font-weight:750;background:var(--surface2);white-space:nowrap}
      .cloud-status::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--muted)}
      .cloud-status.connected::before{background:var(--success)}.cloud-status.syncing::before{background:var(--warn)}.cloud-status.error::before{background:var(--danger)}
      .cloud-account{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;padding:11px 12px;border:1px solid var(--border);border-radius:14px;background:var(--surface2);margin:11px 0}
      .cloud-avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;background:var(--surface3);border:1px solid var(--border)}
      .cloud-avatar-fallback{display:grid;place-items:center;font-weight:850;color:var(--accent)}
      .cloud-account-text{min-width:0}.cloud-account-text strong,.cloud-account-text span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cloud-meta{display:grid;gap:5px;margin:10px 0;color:var(--muted);font-size:.78rem}.cloud-meta strong{color:var(--text)}
      .cloud-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.cloud-actions .btn{min-height:38px}
      .cloud-switch{margin-top:12px}.cloud-note{margin-top:10px;font-size:.75rem;color:var(--muted);line-height:1.45}
      @media(max-width:560px){.cloud-head{display:grid}.cloud-actions{display:grid;grid-template-columns:1fr 1fr}.cloud-actions .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function accountMarkup(){
    if(!connected())return '';
    const display=profile?.name||profile?.email||'Google account';
    const email=profile?.email&&profile.email!==display?profile.email:'';
    const avatar=profile?.picture
      ?`<img class="cloud-avatar" src="${htmlEsc(profile.picture)}" alt="" referrerpolicy="no-referrer">`
      :`<div class="cloud-avatar cloud-avatar-fallback" aria-hidden="true">G</div>`;
    return `<div class="cloud-account">${avatar}<div class="cloud-account-text"><strong>${htmlEsc(display)}</strong>${email?`<span class="tiny muted">${htmlEsc(email)}</span>`:''}</div></div>`;
  }

  function cloudPanelHtml(){
    const badProtocol=!['http:','https:'].includes(location.protocol);
    const ready=configured()&&!badProtocol;
    const statusClass=cloudStatus==='connected'?'connected':cloudStatus==='syncing'?'syncing':cloudStatus==='error'?'error':'';
    const statusLabel=connected()?(cloudStatus==='syncing'?'Syncing…':cloudStatus==='error'?'Sync issue':'Connected'):(prefs.wasConnected?'Reconnect':'Not connected');
    const primaryLabel=prefs.wasConnected?'Reconnect Google':'Continue with Google';
    let setup='';
    if(!configured())setup='<p class="cloud-note"><strong>Setup required:</strong> add the Google OAuth Web client ID in <code>cloud-config.js</code>. Local backups continue to work normally.</p>';
    else if(badProtocol)setup='<p class="cloud-note">Google sync requires HTTPS or localhost. It is unavailable when this file is opened directly from disk.</p>';
    return `<article class="card flat cloud-card" id="cloud-sync-card">
      <div class="cloud-head"><div><h2>Google account &amp; sync</h2><p class="muted small-text">Keep progress synchronized across devices and store private backups in your Google Drive app-data area.</p></div><span class="cloud-status ${statusClass}">${htmlEsc(statusLabel)}</span></div>
      ${accountMarkup()}
      <div class="cloud-meta"><div><strong>Status:</strong> ${htmlEsc(cloudMessage)}</div><div><strong>Last sync:</strong> ${htmlEsc(fmtCloudTime(prefs.lastSyncAt))}</div>${lastRemoteModified?`<div><strong>Cloud copy:</strong> ${htmlEsc(fmtCloudTime(lastRemoteModified))}</div>`:''}</div>
      <div class="cloud-actions">
        ${connected()?`<button class="btn primary" data-cloud-action="sync-now" ${!online()?'disabled':''}>Sync now</button><button class="btn" data-cloud-action="create-backup" ${!online()?'disabled':''}>Create cloud backup</button><button class="btn" data-cloud-action="restore-backup" ${!online()?'disabled':''}>Restore backup</button><button class="btn" data-cloud-action="disconnect">Sign out</button>`:`<button class="btn primary" data-cloud-action="connect" ${!ready||!online()?'disabled':''}>${htmlEsc(primaryLabel)}</button>`}
      </div>
      <label class="switch-row cloud-switch"><span><strong>Automatic sync</strong><br><span class="tiny muted">Sync after saved progress changes while this Google session is connected.</span></span><input type="checkbox" id="cloud-auto-sync" ${prefs.autoSync?'checked':''} ${!configured()?'disabled':''}></label>
      <p class="cloud-note">TMS60 remains local-first. Google access tokens stay in memory only; signing out or closing the browser does not delete local progress.</p>
      ${setup}
    </article>`;
  }

  function injectCloudPanel(){
    injectStyles();
    const settings=document.getElementById('view-settings');
    if(!settings)return;
    settings.querySelector('#cloud-sync-card')?.remove();
    const stacks=settings.querySelectorAll('.settings-grid>.stack');
    const target=stacks[1]||stacks[0];
    if(target)target.insertAdjacentHTML('afterbegin',cloudPanelHtml());
  }

  function refreshCloudPanel(){
    if(document.getElementById('view-settings')?.classList.contains('active'))injectCloudPanel();
  }

  async function loadGis(){
    if(window.google?.accounts?.oauth2)return;
    if(gisPromise)return gisPromise;
    gisPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-tms60-google-identity]');
      if(existing){
        existing.addEventListener('load',()=>resolve(),{once:true});
        existing.addEventListener('error',()=>reject(new Error('Google Identity Services failed to load.')),{once:true});
        return;
      }
      const s=document.createElement('script');
      s.src='https://accounts.google.com/gsi/client';
      s.async=true;s.defer=true;s.dataset.tms60GoogleIdentity='1';
      s.onload=()=>resolve();
      s.onerror=()=>reject(new Error('Google Identity Services failed to load.'));
      document.head.appendChild(s);
    });
    return gisPromise;
  }

  async function ensureTokenClient(){
    if(!configured())throw new Error('Google OAuth client ID is not configured.');
    if(!['http:','https:'].includes(location.protocol))throw new Error('Google OAuth requires HTTPS or localhost.');
    await loadGis();
    if(tokenClient)return tokenClient;
    tokenClient=google.accounts.oauth2.initTokenClient({
      client_id:CLIENT_ID,
      scope:SCOPE,
      callback:()=>{},
      error_callback:error=>tokenErrorCallback?.(error)
    });
    return tokenClient;
  }

  function requestToken(prompt='consent'){
    return new Promise(async(resolve,reject)=>{
      try{
        const client=await ensureTokenClient();
        client.callback=response=>{
          if(response?.error){reject(new Error(response.error_description||response.error));return}
          if(!response?.access_token){reject(new Error('Google did not return an access token.'));return}
          token=response.access_token;
          const seconds=Math.max(60,Number(response.expires_in)||3600);
          tokenExpiresAt=Date.now()+seconds*1000;
          resolve(token);
        };
        tokenErrorCallback=err=>reject(new Error(err?.message||err?.type||'Google authorization failed.'));
        client.requestAccessToken({prompt});
      }catch(error){reject(error)}
    });
  }

  async function apiFetch(url,options={}){
    if(!connected())throw new Error('Google session expired. Reconnect to continue syncing.');
    const headers=new Headers(options.headers||{});
    headers.set('Authorization',`Bearer ${token}`);
    const response=await fetch(url,{...options,headers});
    if(response.status===401||response.status===403){
      token=null;tokenExpiresAt=0;profile=null;
      setCloudStatus('disconnected','Google session expired — reconnect to sync');
      throw new Error('Google session expired. Reconnect to continue syncing.');
    }
    return response;
  }

  async function fetchProfile(){
    try{
      const response=await apiFetch(USERINFO,{headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error(`Profile request failed (${response.status}).`);
      const raw=await response.json();
      profile={name:String(raw.name||'').slice(0,120),email:String(raw.email||'').slice(0,254),picture:String(raw.picture||'').slice(0,1000)};
    }catch(_){profile=null}
    refreshCloudPanel();
  }

  const escapeDriveQuery=value=>String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  async function listByName(name){
    const params=new URLSearchParams({spaces:'appDataFolder',q:`name = '${escapeDriveQuery(name)}' and trashed = false`,fields:'files(id,name,modifiedTime,size)',orderBy:'modifiedTime desc',pageSize:'10'});
    const response=await apiFetch(`${DRIVE}/files?${params}`,{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Google Drive list failed (${response.status}).`);
    const data=await response.json();
    return Array.isArray(data.files)?data.files:[];
  }

  async function listBackups(){
    const params=new URLSearchParams({spaces:'appDataFolder',q:`name contains '${escapeDriveQuery(BACKUP_PREFIX)}' and trashed = false`,fields:'files(id,name,modifiedTime,size)',orderBy:'modifiedTime desc',pageSize:'100'});
    const response=await apiFetch(`${DRIVE}/files?${params}`,{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Google Drive backup list failed (${response.status}).`);
    const data=await response.json();
    return (Array.isArray(data.files)?data.files:[]).filter(file=>String(file.name||'').startsWith(BACKUP_PREFIX));
  }

  async function downloadDriveJson(fileId){
    const response=await apiFetch(`${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media`,{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Google Drive download failed (${response.status}).`);
    const text=await response.text();
    if(text.length>32*1024*1024)throw new Error('Cloud data exceeds the 32 MB safety limit.');
    return safeJsonParse(text,null);
  }

  function cloudEnvelope(sourceState=state){
    return {
      format:CLOUD_FORMAT,
      formatVersion:CLOUD_VERSION,
      appSchema:SCHEMA,
      savedAt:new Date().toISOString(),
      deviceId:prefs.deviceId,
      state:sanitizeState(sourceState)
    };
  }

  function readCloudEnvelope(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Cloud data is invalid.');
    if(raw.format!==CLOUD_FORMAT||Number(raw.formatVersion)!==CLOUD_VERSION)throw new Error('Cloud data format is not supported.');
    if(Number(raw.appSchema||raw.state?.version||1)>SCHEMA)throw new Error('Cloud data was created by a newer TMS60 version.');
    if(!completeStateShape(raw.state))throw new Error('Cloud progress is incomplete.');
    return {envelope:raw,state:sanitizeState(raw.state)};
  }

  async function createDriveJson(name,envelope){
    const boundary=`tms60_${crypto.randomUUID?.()||Date.now()}`;
    const metadata=JSON.stringify({name,parents:['appDataFolder'],mimeType:'application/json'});
    const content=JSON.stringify(envelope);
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
    const response=await apiFetch(`${UPLOAD}/files?uploadType=multipart&fields=id,name,modifiedTime,size`,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
    if(!response.ok)throw new Error(`Google Drive upload failed (${response.status}).`);
    return response.json();
  }

  async function updateDriveJson(fileId,envelope){
    const response=await apiFetch(`${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime,size`,{method:'PATCH',headers:{'Content-Type':'application/json; charset=UTF-8'},body:JSON.stringify(envelope)});
    if(!response.ok)throw new Error(`Google Drive update failed (${response.status}).`);
    return response.json();
  }

  async function deleteDriveFile(fileId){
    const response=await apiFetch(`${DRIVE}/files/${encodeURIComponent(fileId)}`,{method:'DELETE'});
    if(!response.ok&&response.status!==404)throw new Error(`Google Drive cleanup failed (${response.status}).`);
  }

  async function getRemoteSync(){
    const files=await listByName(SYNC_FILE);
    if(!files.length)return null;
    let combined=null;
    let newestEnvelope=null;
    for(const file of files){
      const parsed=readCloudEnvelope(await downloadDriveJson(file.id));
      combined=combined?mergeStates(combined,parsed.state):parsed.state;
      if(!newestEnvelope)newestEnvelope=parsed.envelope;
    }
    const file=files[0];
    lastRemoteModified=file.modifiedTime||newestEnvelope?.savedAt||'';
    return {file,envelope:newestEnvelope,state:sanitizeState(combined),duplicateIds:files.slice(1).map(x=>x.id)};
  }

  function persistMergedLocal(next,{snapshot=true}={}){
    const currentJson=JSON.stringify(sanitizeState(state));
    const nextJson=JSON.stringify(sanitizeState(next));
    if(currentJson===nextJson)return false;
    if(snapshot)createRecoverySnapshot();
    state=sanitizeState(next);
    const result=baseSave();
    renderAll();
    return result!==false;
  }

  async function writeCanonical(envelope,file=null,duplicateIds=[]){
    const result=file?await updateDriveJson(file.id,envelope):await createDriveJson(SYNC_FILE,envelope);
    for(const id of duplicateIds){
      try{await deleteDriveFile(id)}catch(_){/* Duplicate cleanup is best-effort. */}
    }
    lastRemoteModified=result.modifiedTime||envelope.savedAt;
    return result;
  }

  async function syncRound(){
    const remote=await getRemoteSync();
    if(!remote){
      const created=await writeCanonical(cloudEnvelope());
      return {changedLocal:false,created:true,remoteFile:created};
    }
    const merged=mergeStates(state,remote.state);
    const changedLocal=JSON.stringify(sanitizeState(merged))!==JSON.stringify(sanitizeState(state));
    if(changedLocal)persistMergedLocal(merged,{snapshot:true});
    const mergedEnvelope=cloudEnvelope(merged);
    await writeCanonical(mergedEnvelope,remote.file,remote.duplicateIds);
    return {changedLocal,created:false,remoteFile:remote.file};
  }

  async function performSync({manual=false}={}){
    if(syncPromise)return syncPromise;
    if(!connected()){
      if(manual)throw new Error('Reconnect Google before syncing.');
      return null;
    }
    if(!online()){
      pendingAutoSync=true;
      if(manual)throw new Error('You are offline. Local progress is safe and will sync after reconnecting.');
      return null;
    }
    if(hasActiveSession()){
      pendingAutoSync=true;
      if(manual)throw new Error('End the active recall session before merging cloud progress.');
      return null;
    }
    syncPromise=(async()=>{
      setCloudStatus('syncing','Comparing local and cloud progress…');
      const first=await syncRound();
      // Verify once more to reduce the chance of a simultaneous-device write
      // temporarily hiding newer progress. mergeStates is deterministic and
      // idempotent for the same inputs.
      const verify=await getRemoteSync();
      if(verify){
        const mergedAgain=mergeStates(state,verify.state);
        const localChanged=JSON.stringify(sanitizeState(mergedAgain))!==JSON.stringify(sanitizeState(state));
        if(localChanged)persistMergedLocal(mergedAgain,{snapshot:true});
        if(localChanged||JSON.stringify(sanitizeState(verify.state))!==JSON.stringify(sanitizeState(state))){
          await writeCanonical(cloudEnvelope(state),verify.file,verify.duplicateIds);
        }
      }
      prefs.lastSyncAt=Date.now();
      prefs.wasConnected=true;
      pendingAutoSync=false;
      writePrefs();
      setCloudStatus('connected',first.changedLocal?'Synced — cloud changes merged safely':'Up to date');
      return first;
    })().catch(error=>{
      if(connected())setCloudStatus('error',String(error?.message||error));
      throw error;
    }).finally(()=>{syncPromise=null});
    return syncPromise;
  }

  function queueAutoSync(){
    if(!prefs.autoSync||!connected())return;
    pendingAutoSync=true;
    clearTimeout(syncTimer);
    const elapsed=Date.now()-(Number(prefs.lastSyncAt)||0);
    syncTimer=setTimeout(()=>{performSync().catch(()=>{})},Math.max(AUTO_DEBOUNCE,AUTO_MIN_INTERVAL-elapsed));
  }

  async function connectGoogle(){
    if(!online())throw new Error('Connect to the internet before signing in with Google.');
    setCloudStatus('syncing','Opening Google authorization…');
    // After a reload, first try the normal token flow without forcing the
    // consent screen again. A first-time connection still requests consent.
    await requestToken(prefs.wasConnected?'':'consent');
    prefs.wasConnected=true;writePrefs();
    await fetchProfile();
    setCloudStatus('syncing','Checking cloud progress…');
    await performSync({manual:true});
  }

  function disconnectGoogle(){
    clearTimeout(syncTimer);syncTimer=0;pendingAutoSync=false;
    // Signing out of TMS60 forgets only this in-memory access token. It does
    // not revoke the user's Google grant; reconnecting later stays low-friction.
    token=null;tokenExpiresAt=0;profile=null;lastRemoteModified='';
    prefs.wasConnected=false;writePrefs();
    setCloudStatus('disconnected','Signed out — local progress remains on this device');
  }

  async function createCloudBackup(){
    if(hasActiveSession())throw new Error('End the active recall session before creating a cloud backup.');
    setCloudStatus('syncing','Creating cloud backup…');
    await performSync({manual:true});
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    await createDriveJson(`${BACKUP_PREFIX}${stamp}.json`,cloudEnvelope());
    const files=await listBackups();
    for(const old of files.slice(MAX_BACKUPS))await deleteDriveFile(old.id);
    setCloudStatus('connected',`Cloud backup created · ${Math.min(files.length,MAX_BACKUPS)} kept`);
    toast('Cloud backup created.');
  }

  async function openRestoreModal(){
    if(hasActiveSession())throw new Error('End the active recall session before restoring cloud data.');
    setCloudStatus('syncing','Loading cloud backups…');
    restoreFiles=(await listBackups()).slice(0,MAX_BACKUPS);
    setCloudStatus('connected','Cloud backups ready');
    if(!restoreFiles.length){toast('No cloud backups are available yet.','error');return}
    modal(`<div class="modal-head"><h2>Restore cloud backup</h2><button class="btn icon-btn" data-action="close-modal" aria-label="Close dialog">×</button></div><p class="muted">Choose a Google Drive backup. TMS60 will create a local recovery snapshot and a fresh cloud backup of your current state before replacing progress.</p><div class="side-list">${restoreFiles.map((file,index)=>`<button class="btn" data-cloud-action="restore-file" data-cloud-index="${index}">${htmlEsc(fmtCloudTime(file.modifiedTime))}</button>`).join('')}</div><div class="modal-actions"><button class="btn" data-action="close-modal">Cancel</button></div>`);
  }

  async function restoreCloudFile(index){
    if(hasActiveSession())throw new Error('End the active recall session before restoring cloud data.');
    const file=restoreFiles[Number(index)];
    if(!file)throw new Error('That cloud backup is no longer available.');
    const raw=await downloadDriveJson(file.id);
    const restored=readCloudEnvelope(raw).state;
    // Preserve the current cloud/local state as a recovery point before the
    // destructive replace. Then give the restored state a fresh epoch so the
    // intentional restore wins over stale devices on the next merge.
    await createCloudBackup();
    createRecoverySnapshot();
    state=sanitizeState(restored);
    setNewEpoch();
    state.meta.settingsChangedAt=state.meta.stateEpoch;
    baseSave();
    renderAll();
    closeModal(false);
    const remote=await getRemoteSync();
    await writeCanonical(cloudEnvelope(state),remote?.file||null,remote?.duplicateIds||[]);
    prefs.lastSyncAt=Date.now();writePrefs();
    setCloudStatus('connected','Cloud backup restored and synchronized');
    toast('Cloud backup restored.');
  }

  async function handleCloudAction(button){
    const action=button.dataset.cloudAction;
    try{
      button.disabled=true;
      if(action==='connect')await connectGoogle();
      else if(action==='sync-now'){await performSync({manual:true});toast('Google sync complete.');}
      else if(action==='create-backup')await createCloudBackup();
      else if(action==='restore-backup')await openRestoreModal();
      else if(action==='restore-file')await restoreCloudFile(button.dataset.cloudIndex);
      else if(action==='disconnect')disconnectGoogle();
    }catch(error){
      const message=String(error?.message||error||'Cloud action failed.');
      if(connected())setCloudStatus('error',message);
      else setCloudStatus('disconnected',message);
      toast(message,'error');
    }finally{button.disabled=false;refreshCloudPanel()}
  }

  // Keep the cloud card present after the core settings view is re-rendered.
  const baseRenderSettings=renderSettings;
  renderSettings=function(){baseRenderSettings();injectCloudPanel()};

  // Queue cloud sync only after the core local save succeeds. This preserves
  // local-first behavior and never blocks study interactions on network I/O.
  const baseSave=save;
  save=function(){const ok=baseSave();if(ok)queueAutoSync();return ok};

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-cloud-action]');
    if(!button)return;
    event.preventDefault();event.stopPropagation();
    handleCloudAction(button);
  },true);

  document.addEventListener('change',event=>{
    if(event.target.id!=='cloud-auto-sync')return;
    prefs.autoSync=Boolean(event.target.checked);writePrefs();
    if(prefs.autoSync)queueAutoSync();
    refreshCloudPanel();
  });

  addEventListener('online',()=>{refreshCloudPanel();if(pendingAutoSync)queueAutoSync()});
  addEventListener('offline',()=>{setCloudStatus(connected()?'error':'disconnected','Offline — local progress continues safely')});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&pendingAutoSync)queueAutoSync()});

  injectCloudPanel();
  if(!configured())setCloudStatus('disconnected','Google sync is not configured for this deployment');
  else if(prefs.wasConnected)setCloudStatus('disconnected','Reconnect Google to resume cloud sync');
  else setCloudStatus('disconnected','Optional — local-only mode is fully supported');

  window.TMS60Cloud=Object.freeze({
    connect:connectGoogle,
    disconnect:disconnectGoogle,
    sync:()=>performSync({manual:true}),
    backup:createCloudBackup,
    configured,
    connected
  });
})();
