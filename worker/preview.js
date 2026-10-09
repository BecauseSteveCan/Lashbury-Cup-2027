const TTL=604800;
const j=(v,s=200,h={})=>new Response(JSON.stringify(v),{status:s,headers:{"content-type":"application/json","cache-control":"no-store",...h}});
const ck=(v,max=TTL)=>"lc_preview="+v+"; Max-Age="+max+"; Path=/; Secure; HttpOnly; SameSite=Lax";
function token(req){return (req.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("lc_preview="))?.slice(11)||""}
async function hash(text){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function sess(req,env){const t=token(req);return t?await env.TOURNAMENT.get("session:"+t,"json"):null}
async function api(req,env,u){
 const p=u.pathname;
 if(p==="/health")return j({ok:true,preview:true,isolated:true});
 if(p==="/auth/login"&&req.method==="POST"){
  const ip=req.headers.get("CF-Connecting-IP")||"unknown";
  const attemptKey="preview-login-attempts:"+await hash(ip);
  const attempts=Number(await env.TOURNAMENT.get(attemptKey)||"0");
  if(attempts>=5)return j({error:"Too many failed attempts. Try again in 15 minutes."},429,{"retry-after":"900"});
  const b=await req.json().catch(()=>({})),pin=String(b.pin||"");
  if(!pin||pin.length>128){await env.TOURNAMENT.put(attemptKey,String(attempts+1),{expirationTtl:900});return j({error:"Invalid PIN"},400)}
  const role=pin==="2741"?"guest":pin==="5836"?"admin":pin==="9162"?"owner":"";
  if(!role){await env.TOURNAMENT.put(attemptKey,String(attempts+1),{expirationTtl:900});return j({error:"Wrong PIN"},401)}
  await env.TOURNAMENT.delete(attemptKey);
  const t=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
  await env.TOURNAMENT.put("session:"+t,JSON.stringify({role}),{expirationTtl:TTL});
  return j({ok:true,role},200,{"set-cookie":ck(t)});
 }
 if(p==="/auth/logout"&&req.method==="POST"){const t=token(req);if(t)await env.TOURNAMENT.delete("session:"+t);return j({ok:true},200,{"set-cookie":ck("",0)})}
 if(p==="/api/session"){const s=await sess(req,env);return j({authenticated:!!s,role:s?.role||null})}
 if(p==="/api/data"&&req.method==="GET"){const s=await sess(req,env);if(!s)return j({error:"Unauthorised"},401);const raw=await env.TOURNAMENT.get("tournament:data");if(!raw)return j({error:"No test data"},503);const d=JSON.parse(raw);delete d.gp;delete d.ownerHash;return j(d)}
 if(p==="/api/data"&&req.method==="PUT"){const s=await sess(req,env);if(!s||!["admin","owner"].includes(s.role))return j({error:"Admin login required"},401);const d=await req.json().catch(()=>null);if(!d||!Array.isArray(d.teams)||!Array.isArray(d.events))return j({error:"Invalid tournament data"},400);d.ts=Date.now();await env.TOURNAMENT.put("tournament:data",JSON.stringify(d));return j({ok:true,ts:d.ts})}
 if(p==="/api/pins"&&req.method==="PUT"){const s=await sess(req,env);if(!s||s.role!=="owner")return j({error:"Owner login required"},401);return j({ok:true,note:"PIN management disabled in preview"})}
 return j({error:"Not found"},404)
}
export default {async fetch(req,env){
 const u=new URL(req.url),p=u.pathname;
 if(p.startsWith("/api/")||p.startsWith("/auth/")||p==="/health")return api(req,env,u);
 const asset=p==="/"?"index.html":p.slice(1);
 if(asset.includes(".."))return new Response("Not found",{status:404});
 const up=await fetch("https://raw.githubusercontent.com/BecauseSteveCan/Lashbury-Cup-2027/security-v1/"+asset);
 if(!up.ok)return new Response("Preview asset missing: "+asset,{status:up.status,headers:{"content-type":"text/plain","cache-control":"no-store"}});
 if(asset==="index.html"){
  let html=await up.text();
  html=html.replace('const API="https://api.lashbury.co.uk";','const API=location.origin;');
  html=html.replace(/if(["']serviceWorker["']in navigator)navigator.serviceWorker.register(["']sw.js\?v=24["']).catch\(\{\}\);/,'');
  const logoutFix = "<script>try{if('serviceWorker' in navigator)navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));if('caches' in window)caches.keys().then(ks=>ks.forEach(k=>caches.delete(k)))}catch(e){};setInterval(()=>{try{const active=typeof sessionRole!=='undefined'&&!!sessionRole;let b=document.getElementById('preview-logout');if(active&&!b){b=document.createElement('button');b.id='preview-logout';b.textContent='Log out';b.style.cssText='position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);right:10px;z-index:99999;border:1px solid var(--bd);background:var(--card);color:var(--tx);border-radius:20px;padding:8px 14px;font:600 13px Inter,system-ui;box-shadow:0 2px 8px #0002';b.onclick=()=>logout();document.body.appendChild(b)}else if(!active&&b)b.remove()}catch(e){}},300);</script>";
  html=html.replace("</body>",logoutFix+"</body>");
  return new Response(html,{headers:{"content-type":"text/html; charset=UTF-8","cache-control":"no-store"}});
 }
 const h=new Headers(up.headers);h.set("cache-control","no-store");return new Response(up.body,{status:up.status,headers:h})
}};
