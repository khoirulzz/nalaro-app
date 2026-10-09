// Nalaro Notify: isolated FCM sender and native-device registry (no website changes).
// Secrets: FCM_SERVICE_ACCOUNT_JSON; Bindings: NOTIFY_DB (D1), MAIL_BUCKET (R2).
const FIREBASE_KEYS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const encoder = new TextEncoder();
let signingKeys = null;
let keysExpires = 0;
let serviceToken = null;
let serviceTokenExpires = 0;
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const respond = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const b64 = (value) => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), ch => ch.charCodeAt(0));
const url64 = (bytes) => {
  let str = ''; for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const digest = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('');
async function verifyAdmin(request,env) {
  const jwt = request.headers.get('Authorization')?.match(/^Bearer ([\w.-]+)$/)?.[1];
  if (!jwt || jwt.length > 10000) throw new ApiError(401,'Login admin diperlukan.');
  try {
    const parts=jwt.split('.'); if(parts.length!==3)throw Error('jwt');
    const header=JSON.parse(new TextDecoder().decode(b64(parts[0])));
    const claims=JSON.parse(new TextDecoder().decode(b64(parts[1])));
    const now=Math.floor(Date.now()/1000);
    if(header.alg!=='RS256'||!header.kid||claims.aud!==env.FIREBASE_PROJECT_ID||
      claims.iss!== 'https://securetoken.google.com/'+env.FIREBASE_PROJECT_ID||
      !claims.sub||claims.sub.length>128||claims.email!==env.ADMIN_EMAIL||
      !Number.isFinite(claims.exp)||claims.exp<=now||
      !Number.isFinite(claims.iat)||claims.iat>now||
      !Number.isFinite(claims.auth_time)||claims.auth_time>now)throw Error('claims');
    if(!signingKeys||Date.now()>keysExpires){
      const response=await fetch(FIREBASE_KEYS);
      if(!response.ok)throw new ApiError(503,'Verifikasi login belum tersedia.');
      signingKeys=(await response.json()).keys;
      keysExpires=Date.now()+Math.min(3600,Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]||300))*1000;
    }
    const jwk=signingKeys.find(x=>x.kid===header.kid&&x.kty==='RSA');
    if(!jwk)throw Error('kid');
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64(parts[2]),encoder.encode(parts[0]+'.'+parts[1])))throw Error('signature');
    return claims;
  }catch(error){ if(error instanceof ApiError)throw error; throw new ApiError(401,'Sesi Firebase tidak valid. Silakan login ulang.'); }
}
function sa(env) {
  if(!env.FCM_SERVICE_ACCOUNT_JSON)throw new ApiError(503,'FCM service account belum tersedia.');
  const json=JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON);
  if(json.type!=='service_account'||!json.private_key||!json.client_email||json.project_id!==env.FIREBASE_PROJECT_ID)throw new ApiError(503,'Service Account dan Firebase project tidak cocok.');
  return json;
}
async function oauthToken(env) {
  if(serviceToken && Date.now()<serviceTokenExpires-60000)return serviceToken;
  const account=sa(env), now=Math.floor(Date.now()/1000);
  const header=url64(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const claims=url64(encoder.encode(JSON.stringify({iss:account.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',aud:account.token_uri||'https://oauth2.googleapis.com/token',iat:now,exp:now+3500})));
  const raw=account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const key=await crypto.subtle.importKey('pkcs8',b64(raw),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=url64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(header+'.'+claims))));
  const response=await fetch(account.token_uri||'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:header+'.'+claims+'.'+signature})});
  if(!response.ok)throw new Error('Google OAuth gagal: HTTP '+response.status);
  const token=await response.json();
  serviceToken=token.access_token; serviceTokenExpires=Date.now()+Number(token.expires_in||3600)*1000;
  return serviceToken;
}
async function notifyDevices(env, eventKey, type, title, body, data) {
  const prior=await env.NOTIFY_DB.prepare('SELECT 1 FROM delivered WHERE event_key=?').bind(eventKey).first();
  if(prior)return 0;
  const rows=await env.NOTIFY_DB.prepare('SELECT id, token FROM devices WHERE active=1 LIMIT 20').all();
  if(!rows.results?.length)return 0;
  const auth=await oauthToken(env);
  let delivered=0;
  for(const row of rows.results){
    const response=await fetch('https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(env.FIREBASE_PROJECT_ID)+'/messages:send',{
      method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},
      body:JSON.stringify({message:{token:row.token,notification:{title:title.slice(0,110),body:body.slice(0,180)},
        data:Object.fromEntries(Object.entries({type,...data}).map(([key,value])=>[key,String(value).slice(0,250)])),
        android:{priority:'high',notification:{channel_id:'nalaro_updates',sound:'default'}}}})
    });
    if(response.ok)delivered++;
    else {
      const result=await response.json().catch(()=>({}));
      const status=String(result.error?.status||'');
      const fcmCode=result.error?.details?.find(x=>x['@type']?.includes('FcmError'))?.errorCode;
      if(status==='NOT_FOUND'||status==='UNREGISTERED'||fcmCode==='UNREGISTERED')
        await env.NOTIFY_DB.prepare('UPDATE devices SET active=0 WHERE id=?').bind(row.id).run();
      else console.error('FCM delivery failed',response.status,status);
    }
  }
  if(delivered)await env.NOTIFY_DB.prepare('INSERT OR IGNORE INTO delivered(event_key,created_at,type) VALUES (?,datetime(\'now\'),?)').bind(eventKey,type).run();
  return delivered;
}
async function pollMail(env) {
  if(!env.MAIL_BUCKET)return;
  const enabled=await env.NOTIFY_DB.prepare("SELECT value FROM state WHERE name='enabled_from'").first();
  const since=Math.max(Date.now()-5*60*1000,Date.parse(enabled?.value||new Date().toISOString()));
  const addresses=String(env.MAILBOX_ADDRESSES||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  for(const mailbox of addresses){
    const objects=await env.MAIL_BUCKET.list({prefix:'mail/v1/'+encodeURIComponent(mailbox)+'/messages/',limit:80,include:['customMetadata']});
    for(const obj of objects.objects||[]){
      const meta=obj.customMetadata?.summary;
      if(!meta)continue;
      let m;try{m=JSON.parse(meta)}catch{continue}
      if(m.status!=='received'||m.folder!=='inbox'||Date.parse(m.createdAt)<since)continue;
      await notifyDevices(env,'mail:'+mailbox+':'+m.id,'mail','Email baru · '+mailbox,(m.from||'Pengirim')+' — '+(m.subject||'Tanpa subjek'),{mailbox,messageId:m.id});
    }
  }
}
function getField(doc,name){const v=doc.fields?.[name];if(!v)return null;return v.stringValue||v.timestampValue||v.integerValue||null}
async function pollOrders(env) {
  const token=await oauthToken(env);
  const url='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(env.FIREBASE_PROJECT_ID)+'/databases/(default)/documents:runQuery';
  const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({structuredQuery:{from:[{collectionId:'projects'}],orderBy:[{field:{fieldPath:'createdAt'},direction:'DESCENDING'}],limit:100}})});
  if(!response.ok)throw new Error('Firestore order scan failed: HTTP '+response.status+' (pastikan service account memiliki role Cloud Datastore Viewer)');
  const result=await response.json();
  const enabled=await env.NOTIFY_DB.prepare("SELECT value FROM state WHERE name='enabled_from'").first();
  const since=Math.max(Date.now()-5*60*1000,Date.parse(enabled?.value||new Date().toISOString()));
  for(const row of result){
    const doc=row.document;if(!doc||getField(doc,'source')!=='public_order')continue;
    const created=getField(doc,'createdAt');if(!created||Date.parse(created)<since)continue;
    const id=doc.name.split('/').pop();
    await notifyDevices(env,'order:'+id,'order','Order baru masuk',String(getField(doc,'name')||'Proyek baru'),{projectId:id});
  }
}
async function runCycle(env) {
  const failures=[];
  try{await pollMail(env)}catch(e){failures.push('mail: '+String(e.message||e).slice(0,160))}
  try{await pollOrders(env)}catch(e){failures.push('order: '+String(e.message||e).slice(0,160))}
  const error=failures.join('; ');
  await env.NOTIFY_DB.prepare("INSERT INTO state(name,value) VALUES('last_poll',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value").bind(new Date().toISOString()).run();
  await env.NOTIFY_DB.prepare("INSERT INTO state(name,value) VALUES('last_error',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value").bind(error).run();
  if(error)console.error('Notify poll',error);
}
export default {
  async scheduled(_event,env,ctx){ctx.waitUntil(runCycle(env))},
  async fetch(request,env){
    const origin=request.headers.get('Origin');
    const allowed=['http://localhost','capacitor://localhost'];
    const headers={};
    if(origin && allowed.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Vary':'Origin'});
    if(request.method==='OPTIONS')return new Response(null,{status:origin && !allowed.includes(origin)?403:204,headers});
    if(origin && !allowed.includes(origin))return respond({error:'Origin tidak diizinkan.'},403,headers);
    const url=new URL(request.url);
    if(url.pathname==='/health' && request.method==='GET')return respond({ok:true,service:'nalaro-notify'},200,headers);
    try {
      const claims=await verifyAdmin(request,env);
      if(url.pathname==='/register' && request.method==='POST'){
        const body=await request.json().catch(()=>({}));
        if(typeof body.token!=='string'||body.token.length<32||body.token.length>4096||/[\s]/.test(body.token))throw new ApiError(400,'FCM token tidak valid.');
        const id=await digest(body.token);
        await env.NOTIFY_DB.prepare("INSERT INTO devices(id,token,uid,created_at,updated_at,active) VALUES(?,?,?,datetime('now'),datetime('now'),1) ON CONFLICT(id) DO UPDATE SET uid=excluded.uid,updated_at=datetime('now'),active=1").bind(id,body.token,claims.sub).run();
        return respond({ok:true},200,headers);
      }
      if(url.pathname==='/unregister' && request.method==='POST'){
        const body=await request.json().catch(()=>({}));
        if(typeof body.token!=='string')throw new ApiError(400,'FCM token diperlukan.');
        await env.NOTIFY_DB.prepare("DELETE FROM devices WHERE id=? AND uid=?").bind(await digest(body.token),claims.sub).run();
        return respond({ok:true},200,headers);
      }
      if(url.pathname==='/status' && request.method==='GET'){
        const devices=await env.NOTIFY_DB.prepare('SELECT COUNT(*) AS count FROM devices WHERE active=1 AND uid=?').bind(claims.sub).first();
        const rows=await env.NOTIFY_DB.prepare("SELECT name,value FROM state WHERE name IN ('last_poll','last_error')").all();
        return respond({ok:true,devices:Number(devices?.count||0),state:Object.fromEntries((rows.results||[]).map(x=>[x.name,x.value]))},200,headers);
      }
      throw new ApiError(404,'Endpoint tidak tersedia.');
    }catch(error){if(!(error instanceof ApiError))console.error('Notify request error',String(error?.message||error).slice(0,180));return respond({error:error instanceof ApiError?error.message:'Layanan notifikasi belum tersedia.'},error instanceof ApiError?error.status:500,headers)}
  }
};
