const SUPABASE_URL='https://hycegznamzjhwinegaai.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_1rZzRPzfLMaAH5pIgCwIjA_19UPMIsR';
const redirects=[
  'https://thiepn.dev/tms60/',
  'https://thiepn.github.io/tms60/',
];

const result={
  projectHost:new URL(SUPABASE_URL).hostname,
  settings:null,
  redirects:[],
};

function safeLocation(value){
  if(!value)return null;
  try{
    const url=new URL(value);
    const googleRedirect=url.hostname==='accounts.google.com'
      ?url.searchParams.get('redirect_uri')
      :null;
    let googleRedirectTarget=null;
    if(googleRedirect){
      try{
        const parsed=new URL(googleRedirect);
        googleRedirectTarget={host:parsed.host,pathname:parsed.pathname};
      }catch{
        googleRedirectTarget={invalid:true};
      }
    }
    return {
      protocol:url.protocol,
      host:url.host,
      pathname:url.pathname,
      error:url.searchParams.get('error')||url.searchParams.get('error_code'),
      errorDescription:url.searchParams.get('error_description'),
      googleRedirectTarget,
    };
  }catch{
    return {invalid:true};
  }
}

try{
  const response=await fetch(`${SUPABASE_URL}/auth/v1/settings`,{
    headers:{apikey:SUPABASE_PUBLISHABLE_KEY},
    signal:AbortSignal.timeout(15000),
  });
  const body=await response.json().catch(()=>({}));
  result.settings={
    status:response.status,
    googleEnabled:body?.external?.google===true,
    providers:body?.external
      ?Object.entries(body.external).filter(([,enabled])=>enabled===true).map(([name])=>name)
      :[],
  };
}catch(error){
  result.settings={error:error?.message||String(error)};
}

for(const redirectTo of redirects){
  try{
    // The redirect allowlist is evaluated before the provider round trip.
    // A syntactically valid PKCE challenge keeps this probe aligned with TMS60.
    const params=new URLSearchParams({
      provider:'google',
      redirect_to:redirectTo,
      code_challenge:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      code_challenge_method:'s256',
    });
    const response=await fetch(`${SUPABASE_URL}/auth/v1/authorize?${params}`,{
      redirect:'manual',
      signal:AbortSignal.timeout(15000),
    });
    const location=response.headers.get('location');
    result.redirects.push({
      redirectTo,
      status:response.status,
      location:safeLocation(location),
      body:response.status>=400?(await response.text()).slice(0,300):undefined,
    });
  }catch(error){
    result.redirects.push({redirectTo,error:error?.message||String(error)});
  }
}

console.log(JSON.stringify(result,null,2));

if(result.settings?.status!==200||!result.settings?.googleEnabled)process.exitCode=1;
if(result.redirects.some(entry=>entry.status!==302||entry.location?.host!=='accounts.google.com'))process.exitCode=1;
if(result.redirects.some(entry=>entry.location?.googleRedirectTarget?.host!==result.projectHost||entry.location?.googleRedirectTarget?.pathname!=='/auth/v1/callback'))process.exitCode=1;
